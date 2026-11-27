import { getFFmpeg } from "./ffmpeg.js";
import { verifyHDR10Output } from "./hdr-processor.js";
import { createGPUHDRPipeline } from "./gpu-hdr.js";

const MEDIABUNNY_URL =
  "https://cdn.jsdelivr.net/npm/mediabunny@1.66.5/dist/bundles/mediabunny.min.mjs";
const MAX_ACCELERATED_INPUT_BYTES = 512 * 1024 * 1024;
const GPU_INPUT_NAME = "hdr-gpu-intermediate.mp4";
let activeConversion = null;
let activeCancelPromise = null;

function cancelActiveConversion() {
  if (!activeConversion) return Promise.resolve();
  if (!activeCancelPromise) activeCancelPromise = activeConversion.cancel();
  return activeCancelPromise;
}

function throwIfAborted(signal) {
  if (signal?.aborted) throw new Error("GPU conversion was canceled.");
}

function bitrateForVideo(metadata) {
  if (metadata.bitrate > 0) return Math.min(Math.max(metadata.bitrate * 1.5, 1_000_000), 80_000_000);
  const fps = metadata.frameRate || 30;
  const estimated = (metadata.width || 1920) * (metadata.height || 1080) * fps * 0.12;
  return Math.min(Math.max(estimated, 1_000_000), 80_000_000);
}

async function deleteIfPresent(ffmpeg, filename) {
  try {
    await ffmpeg.deleteFile(filename);
  } catch {
    // The file may not have been created.
  }
}

async function remuxAndVerify(ffmpeg, intermediateName, outputName, metadata, onProgress) {
  const baseArgs = [
    "-hide_banner",
    "-i", intermediateName,
    "-map", "0:v:0",
    "-map", "0:a?",
    "-map_metadata", "0",
    "-c:v", "copy",
    "-tag:v", "hvc1",
    "-bsf:v", "hevc_metadata=video_full_range_flag=0:colour_primaries=9:transfer_characteristics=16:matrix_coefficients=9",
    "-c:a", "copy",
    "-color_primaries", "bt2020",
    "-color_trc", "smpte2084",
    "-colorspace", "bt2020nc",
    "-color_range", "tv",
    "-movflags", "+faststart+write_colr",
    outputName,
  ];
  const logLines = [];
  const progressListener = ({ progress }) => {
    if (Number.isFinite(progress) && progress >= 0 && progress <= 1) onProgress({ ratio: progress });
  };
  const logListener = ({ message }) => {
    if (message) logLines.push(message);
  };
  ffmpeg.on("progress", progressListener);
  ffmpeg.on("log", logListener);
  try {
    let code = await ffmpeg.exec(baseArgs);
    if (code !== 0 && metadata.audio.length) {
      const logs = logLines.join("\n");
      const unsupportedAudio =
        /Could not find tag for codec|codec .* not currently supported in container|Invalid audio stream|audio stream.*unsupported/i.test(logs);
      if (unsupportedAudio) {
        await deleteIfPresent(ffmpeg, outputName);
        logLines.length = 0;
        const aacArgs = [...baseArgs];
        aacArgs[aacArgs.indexOf("-c:a") + 1] = "aac";
        code = await ffmpeg.exec(aacArgs);
      }
    }
    if (code !== 0) {
      const details = logLines.slice(-4).join(" ").trim();
      throw new Error(`GPU output remux failed.${details ? ` ${details}` : ""}`);
    }
  } finally {
    ffmpeg.off("progress", progressListener);
    ffmpeg.off("log", logListener);
  }

  await verifyHDR10Output(ffmpeg, outputName);
  const output = await ffmpeg.readFile(outputName);
  if (!(output instanceof Uint8Array) || output.byteLength === 0) {
    throw new Error("The GPU path produced an empty output file.");
  }
  return output;
}

export async function processHDR10Accelerated({
  file,
  outputName,
  metadata,
  intensity,
  fileSize,
  onProgress,
  onStatus,
  signal,
}) {
  if (signal?.aborted) throw new Error("GPU conversion was canceled.");
  if (fileSize > MAX_ACCELERATED_INPUT_BYTES) {
    throw new Error("GPU conversion is limited to 512 MiB to avoid excessive browser memory use.");
  }
  if (!("gpu" in navigator) || !("VideoEncoder" in globalThis) || !("VideoDecoder" in globalThis)) {
    throw new Error("This browser does not support WebGPU and WebCodecs.");
  }

  onStatus("Checking browser HEVC Main 10 encoder support");
  const { Input, ALL_FORMATS, BlobSource, Output, Mp4OutputFormat, BufferTarget, Conversion } =
    await import(MEDIABUNNY_URL);
  throwIfAborted(signal);
  const { width, height, frameRate } = metadata;
  const bitrate = bitrateForVideo(metadata);
  const gpu = await createGPUHDRPipeline({ width, height, bitrate, frameRate, intensity });
  if (signal?.aborted) {
    gpu.dispose();
    throw new Error("GPU conversion was canceled.");
  }
  let input = null;
  let target = null;
  let output = null;
  let conversion;
  let abortListener = null;
  let succeeded = false;
  let ffmpeg = null;

  try {
    input = new Input({ formats: ALL_FORMATS, source: new BlobSource(file) });
    target = new BufferTarget();
    output = new Output({ format: new Mp4OutputFormat(), target });
    const videoTracks = await input.getVideoTracks();
    throwIfAborted(signal);
    const primaryVideo = await input.getPrimaryVideoTrack();
    if (!primaryVideo) {
      throw new Error("The browser cannot decode this input with WebCodecs.");
    }
    const canDecode = await primaryVideo.canDecode();
    throwIfAborted(signal);
    if (!canDecode) throw new Error("The browser cannot decode this input with WebCodecs.");
    if (!videoTracks.includes(primaryVideo)) {
      throw new Error("The primary video track could not be selected for GPU processing.");
    }

    const videoOptions = {
      codec: "hevc",
      fullCodecString: gpu.codecString,
      bitrate,
      forceTranscode: true,
      hardwareAcceleration: "prefer-hardware",
      allowTransformationMetadata: false,
      process: (sample) => gpu.processFrame(sample),
    };
    conversion = await Conversion.init({
      input,
      output,
      tracks: "all",
      video: (track) => track === primaryVideo ? videoOptions : { discard: true },
      showWarnings: false,
    });
    if (!conversion.isValid) {
      const reasons = conversion.discardedTracks
        .map((track) => track.reason)
        .filter(Boolean)
        .join("; ");
      throw new Error(`The browser conversion cannot preserve all required media tracks.${reasons ? ` ${reasons}` : ""}`);
    }
    const discardedAudio = conversion.discardedTracks.some((track) => track.track?.type === "audio");
    if (discardedAudio) throw new Error("The browser conversion would discard the source audio.");

    activeConversion = conversion;
    activeCancelPromise = null;
    abortListener = () => {
      if (activeConversion !== conversion) return;
      cancelActiveConversion().catch((error) => {
        console.warn("Could not stop the accelerated conversion after cancellation.", error);
      });
    };
    signal?.addEventListener("abort", abortListener, { once: true });
    if (signal?.aborted) abortListener();
    conversion.onProgress = (ratio) => onProgress({ ratio });
    onStatus("Processing video with WebGPU and HEVC Main 10");
    await conversion.execute();
    if (signal?.aborted) throw new Error("GPU conversion was canceled.");
    if (!(target.buffer instanceof ArrayBuffer) || target.buffer.byteLength === 0) {
      throw new Error("The browser encoder produced an empty MP4.");
    }

    onStatus("Verifying 10-bit HEVC and HDR color metadata");
    ffmpeg = await getFFmpeg();
    await deleteIfPresent(ffmpeg, GPU_INPUT_NAME);
    await deleteIfPresent(ffmpeg, outputName);
    await ffmpeg.writeFile(GPU_INPUT_NAME, new Uint8Array(target.buffer));
    const result = await remuxAndVerify(ffmpeg, GPU_INPUT_NAME, outputName, metadata, onProgress);
    succeeded = true;
    return result;
  } finally {
    if (abortListener) signal?.removeEventListener("abort", abortListener);
    if (conversion && conversion.state !== "done" && conversion.state !== "canceled") {
      try {
        await (activeConversion === conversion ? cancelActiveConversion() : conversion.cancel());
      } catch (error) {
        console.warn("Could not stop the accelerated conversion cleanly.", error);
      }
    }
    activeConversion = null;
    activeCancelPromise = null;
    if (input) input.dispose();
    gpu.dispose();
    if (ffmpeg) {
      await deleteIfPresent(ffmpeg, GPU_INPUT_NAME);
      if (!succeeded) await deleteIfPresent(ffmpeg, outputName);
    }
  }
}

export async function cancelHDRAcceleration() {
  await cancelActiveConversion();
}
