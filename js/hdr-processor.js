import { getFFmpeg } from "./ffmpeg.js";

const MAX_UPLOAD_BYTES = 2 * 1024 * 1024 * 1024;

function bitrateForVideo(metadata) {
  if (metadata.bitrate > 0) return Math.min(Math.max(metadata.bitrate * 1.5, 1_000_000), 80_000_000);
  const fps = metadata.frameRate || 30;
  const estimated = (metadata.width || 1920) * (metadata.height || 1080) * fps * 0.12;
  return Math.min(Math.max(estimated, 1_000_000), 80_000_000);
}

function qualityForVideo(metadata) {
  const pixelsPerSecond = (metadata.width || 1920) * (metadata.height || 1080) * (metadata.frameRate || 30);
  if (pixelsPerSecond > 3840 * 2160 * 30) return 22;
  if (pixelsPerSecond > 1920 * 1080 * 30) return 21;
  return 20;
}

function conversionFilter(intensity) {
  const strength = Math.min(1, Math.max(0, Number(intensity) / 100));
  const toneCurve = (0.2 * strength).toFixed(4);
  const nominalPeak = Math.round(100 + 150 * strength);
  return [
    "zscale=transfer=linear:npl=100",
    "format=gbrp16le",
    `lutrgb=r='val*(1+${toneCurve}*(1-val/maxval))':g='val*(1+${toneCurve}*(1-val/maxval))':b='val*(1+${toneCurve}*(1-val/maxval))'`,
    `zscale=primaries=bt2020:transfer=smpte2084:matrix=bt2020nc:range=limited:npl=${nominalPeak}`,
    "format=yuv420p",
  ].join(",");
}

async function readCapabilities(ffmpeg) {
  const logs = [];
  const listener = ({ message }) => logs.push(message);
  ffmpeg.on("log", listener);
  try {
    await ffmpeg.exec(["-hide_banner", "-filters"]);
    const filterOutput = logs.join("\n");
    logs.length = 0;
    await ffmpeg.exec(["-hide_banner", "-encoders"]);
    const encoderOutput = logs.join("\n");
    const requiredFilters = ["zscale", "lutrgb"];
    const missingFilters = requiredFilters.filter((name) =>
      !filterOutput.split(/\r?\n/).some((line) => line.includes(name) && /^\s*[TSC.]{3}\s/.test(line)),
    );
    if (missingFilters.length) {
      throw new Error(`This FFmpeg core is missing required ${missingFilters.join(" and ")} filter${missingFilters.length > 1 ? "s" : ""}. No conversion was attempted.`);
    }
    if (!encoderOutput.split(/\r?\n/).some((line) => /^\s*V\S{5}\s+libx264\s/.test(line))) {
      throw new Error("This FFmpeg core has no libx264 encoder. A compatible MP4 HDR output cannot be created with this build.");
    }
  } finally {
    ffmpeg.off("log", listener);
  }
}

export async function processHDR({ inputName, outputName, metadata, intensity, fileSize, onProgress }) {
  if (fileSize > MAX_UPLOAD_BYTES) {
    throw new Error("This file is larger than the app's 2 GiB safety limit. Try a smaller video to avoid exhausting browser memory.");
  }
  if (!metadata.isSDR) {
    throw new Error("This file is not identified as BT.709 SDR. HDR or unknown color metadata is not converted to prevent an incorrect result.");
  }

  const ffmpeg = await getFFmpeg();
  await readCapabilities(ffmpeg);
  const maxRate = Math.round(bitrateForVideo(metadata) / 1000);
  const bufferSize = Math.round(maxRate * 2);
  const quality = qualityForVideo(metadata);
  const args = [
    "-hide_banner",
    "-i", inputName,
    "-map", "0:v:0",
    "-map", "0:a?",
    "-map_metadata", "0",
    "-vf", conversionFilter(intensity),
    "-c:v", "libx264",
    "-preset", "veryfast",
    "-threads", "1",
    "-crf", String(quality),
    "-maxrate", `${maxRate}k`,
    "-bufsize", `${bufferSize}k`,
    "-pix_fmt", "yuv420p",
    "-color_primaries", "bt2020",
    "-color_trc", "smpte2084",
    "-colorspace", "bt2020nc",
    "-color_range", "tv",
    "-fps_mode", "passthrough",
    "-c:a", "copy",
    "-movflags", "+faststart+write_colr",
    outputName,
  ];

  const progressListener = ({ progress }) => {
    const ratio = Number.isFinite(progress) ? progress : null;
    if (ratio !== null) onProgress({ ratio });
  };
  const logLines = [];
  const logListener = ({ message }) => {
    if (message) logLines.push(message);
  };
  ffmpeg.on("progress", progressListener);
  ffmpeg.on("log", logListener);
  try {
    let code = await ffmpeg.exec(args);
    if (code !== 0 && metadata.audio.length) {
      const logText = logLines.join("\n");
      const audioMuxFailure = /Could not find tag for codec|codec .* not currently supported in container|Invalid audio stream|audio stream.*unsupported/i.test(logText);
      if (audioMuxFailure) {
        try {
          await ffmpeg.deleteFile(outputName);
        } catch {
          // The first attempt may fail before creating an output file.
        }
        logLines.length = 0;
        const aacArgs = [...args];
        aacArgs[aacArgs.indexOf("-c:a") + 1] = "aac";
        code = await ffmpeg.exec(aacArgs);
      }
    }
    if (code !== 0) {
      const details = logLines.slice(-4).join(" ").trim();
      throw new Error(`FFmpeg conversion failed.${details ? ` ${details}` : " The source codec may not be supported, or the browser may have run out of memory."}`);
    }

    const verificationFile = "hdr-verify.json";
    await ffmpeg.ffprobe([
      "-v", "error",
      "-select_streams", "v:0",
      "-show_entries", "stream=codec_name,pix_fmt,color_primaries,color_transfer,color_space",
      "-print_format", "json",
      outputName,
      "-o", verificationFile,
    ]);
    let outputMetadata;
    try {
      outputMetadata = JSON.parse(new TextDecoder().decode(await ffmpeg.readFile(verificationFile)));
    } finally {
      try {
        await ffmpeg.deleteFile(verificationFile);
      } catch {
        // The temporary verification file may not exist if ffprobe failed.
      }
    }
    const outputVideo = outputMetadata.streams?.[0];
    if (
      outputVideo?.codec_name !== "h264"
      || outputVideo?.pix_fmt !== "yuv420p"
      || outputVideo?.color_primaries !== "bt2020"
      || outputVideo?.color_transfer !== "smpte2084"
      || outputVideo?.color_space !== "bt2020nc"
    ) {
      throw new Error("The output did not verify as H.264 with BT.2020 / PQ signaling. It will not be offered as HDR.");
    }

    const output = await ffmpeg.readFile(outputName);
    if (!(output instanceof Uint8Array) || output.byteLength === 0) {
      throw new Error("FFmpeg returned an empty output file.");
    }
    return output;
  } finally {
    ffmpeg.off("progress", progressListener);
    ffmpeg.off("log", logListener);
  }
}
