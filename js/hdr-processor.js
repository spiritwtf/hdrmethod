import { getFFmpeg } from "./ffmpeg.js";

const BASE_PEAK_NITS = 100;
const MAX_PEAK_NITS = 1000;
const MAX_LOG_LINES = 80;
const MP4_COPY_AUDIO_CODECS = new Set(["aac", "mp3", "alac", "ac3", "eac3"]);

export async function verifyHDR10Output(ffmpeg, outputName) {
  const verificationFile = "hdr-verify.json";
  let outputMetadata;
  try {
    await ffmpeg.ffprobe([
      "-v", "error",
      "-select_streams", "v:0",
      "-show_entries", "stream=codec_name,profile,pix_fmt,bits_per_raw_sample,color_primaries,color_transfer,color_space,color_range",
      "-print_format", "json",
      outputName,
      "-o", verificationFile,
    ]);
    outputMetadata = JSON.parse(new TextDecoder().decode(await ffmpeg.readFile(verificationFile)));
  } finally {
    try {
      await ffmpeg.deleteFile(verificationFile);
    } catch {
      // The temporary verification file may not exist if ffprobe failed.
    }
  }
  const outputVideo = outputMetadata.streams?.[0];
  const rawBitDepth = outputVideo?.bits_per_raw_sample;
  const bitDepth = rawBitDepth == null || rawBitDepth === "" ? null : Number(rawBitDepth);
  if (
    outputVideo?.codec_name !== "hevc"
    || !/main 10/i.test(outputVideo?.profile || "")
    || !/^yuv420p10(?:le|be)?$/i.test(outputVideo?.pix_fmt || "")
    || (bitDepth !== null && bitDepth !== 10)
    || outputVideo?.color_primaries !== "bt2020"
    || outputVideo?.color_transfer !== "smpte2084"
    || outputVideo?.color_space !== "bt2020nc"
    || outputVideo?.color_range !== "tv"
  ) {
    throw new Error(
      "The output did not verify as 10-bit HEVC Main 10 with BT.2020/PQ signaling. It will not be offered as HDR10.",
    );
  }
}

function conversionFilter(intensity) {
  const strength = Math.min(100, Math.max(0, Number(intensity))) / 100;
  const peakNits = Math.round(BASE_PEAK_NITS + (MAX_PEAK_NITS - BASE_PEAK_NITS) * strength);
  return [
    "zscale=transfer=linear:matrix=gbr:npl=100",
    "format=gbrp16le",
    `zscale=primaries=bt2020:transfer=smpte2084:matrix=bt2020nc:range=limited:npl=${peakNits}`,
    "format=yuv420p10le",
  ].join(",");
}

function progressFromLog(message, duration) {
  if (!duration || !Number.isFinite(duration) || typeof message !== "string") return null;
  const match = /^out_time=(\d+):(\d{2}):(\d{2}(?:\.\d+)?)$/.exec(message.trim());
  if (!match) return null;
  const time = Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]);
  if (!Number.isFinite(time) || time < 0) return null;
  return Math.min(0.999, time / duration);
}

function encodingError(error, logs) {
  const details = logs.filter((line) => line && line !== "Aborted()").slice(-5).join(" ").trim();
  if (/memory access out of bounds|out of memory/i.test(`${error.message} ${details}`)) {
    return new Error("FFmpeg ran out of browser memory. Try a shorter or lower-resolution source video.");
  }
  return new Error(`The local HDR10 encode failed.${details ? ` ${details}` : ` ${error.message}`}`);
}

async function encodeWithFFmpeg(ffmpeg, args, duration, onProgress) {
  const logs = [];
  const logListener = ({ message }) => {
    if (!message) return;
    logs.push(message);
    if (logs.length > MAX_LOG_LINES) logs.shift();
    const ratio = progressFromLog(message, duration);
    if (ratio !== null) onProgress({ ratio });
  };
  ffmpeg.on("log", logListener);
  try {
    const code = await ffmpeg.exec(args);
    return { code, logs };
  } catch (error) {
    throw encodingError(error, logs);
  } finally {
    ffmpeg.off("log", logListener);
  }
}

function encodingArguments({
  inputName,
  outputName,
  intensity,
  audioCodec,
}) {
  return [
    "-hide_banner",
    "-loglevel", "error",
    "-filter_threads", "1",
    "-i", inputName,
    "-map", "0:v:0",
    "-map", "0:a?",
    "-map_metadata", "0",
    "-map_chapters", "0",
    "-vf", conversionFilter(intensity),
    "-fps_mode", "passthrough",
    "-c:v", "libx265",
    "-preset", "medium",
    "-crf", "18",
    "-profile:v", "main10",
    "-pix_fmt", "yuv420p10le",
    "-x265-params", "hdr10=1:hdr10-opt=1:pools=auto:frame-threads=2:log-level=error",
    "-color_primaries", "bt2020",
    "-color_trc", "smpte2084",
    "-colorspace", "bt2020nc",
    "-color_range", "tv",
    "-tag:v", "hvc1",
    "-c:a", audioCodec,
    ...(audioCodec === "aac" ? ["-b:a", "192k"] : []),
    "-movflags", "+faststart+write_colr",
    "-progress", "pipe:1",
    "-stats_period", "0.5",
    outputName,
  ];
}

function audioCodecFor(metadata) {
  const sourceAudio = metadata.audio || [];
  return sourceAudio.some((stream) => !MP4_COPY_AUDIO_CODECS.has(stream.codec_name))
    ? "aac"
    : "copy";
}

export async function processHDR10({
  inputName,
  outputName,
  metadata,
  intensity,
  fileSize,
  onProgress = () => {},
  onStatus = () => {},
  signal,
}) {
  if (signal?.aborted) throw new Error("Video processing was canceled.");
  if (!metadata?.isSDR) {
    throw new Error("Only BT.709 SDR input can be converted to HDR10.");
  }
  if (metadata.width % 2 !== 0 || metadata.height % 2 !== 0) {
    throw new Error("10-bit 4:2:0 HEVC requires even dimensions. This converter will not resize the source video.");
  }
  if (fileSize > 512 * 1024 * 1024) {
    throw new Error("This file exceeds the HDR10 path's 512 MiB memory limit.");
  }

  const ffmpeg = await getFFmpeg();
  if (signal?.aborted) throw new Error("Video processing was canceled.");
  onStatus("Converting BT.709 SDR to 10-bit BT.2020/PQ and encoding with x265");
  await ffmpeg.deleteFile(outputName).catch(() => {});

  const baseArgs = encodingArguments({
    inputName,
    outputName,
    intensity,
    audioCodec: audioCodecFor(metadata),
  });
  const result = await encodeWithFFmpeg(ffmpeg, baseArgs, metadata.duration, onProgress);
  if (signal?.aborted) throw new Error("Video processing was canceled.");
  if (result.code !== 0) {
    throw encodingError(new Error(`FFmpeg exited with code ${result.code}.`), result.logs);
  }

  if (signal?.aborted) throw new Error("Video processing was canceled.");
  onStatus("Verifying 10-bit HEVC Main 10 and HDR color signaling");
  await verifyHDR10Output(ffmpeg, outputName);
  const output = await ffmpeg.readFile(outputName);
  if (!(output instanceof Uint8Array) || output.byteLength === 0) {
    throw new Error("The HDR10 encoder produced an empty output file.");
  }
  return output;
}
