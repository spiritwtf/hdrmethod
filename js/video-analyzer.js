import { getFFmpeg } from "./ffmpeg.js";
import { t } from "./i18n.js";
import { formatBitrate, formatDuration, formatFps, parseFrameRate } from "./utils.js";

export async function mountInputFile(file, inputName) {
  const ffmpeg = await getFFmpeg();
  const mountPoint = "/local-input";
  const inputPath = `${mountPoint}/${inputName}`;
  let mounted = false;
  try {
    await ffmpeg.createDir(mountPoint);
    const namedFile = new File([file], inputName, { type: file.type, lastModified: file.lastModified });
    mounted = await ffmpeg.mount("WORKERFS", { files: [namedFile] }, mountPoint);
  } catch (error) {
    console.warn("WorkerFS could not mount the source; falling back to an in-memory copy.", error);
  }
  if (mounted) return { inputPath, mounted: true };
  if (file.size > 512 * 1024 * 1024) {
    throw new Error("This FFmpeg core could not mount the file without copying it. Files larger than 512 MiB require WorkerFS support to protect browser memory.");
  }
  await ffmpeg.writeFile(inputName, new Uint8Array(await file.arrayBuffer()));
  return { inputPath: inputName, mounted: false };
}

export async function releaseInputFile(inputPath, mounted) {
  const ffmpeg = await getFFmpeg();
  if (mounted) {
    await ffmpeg.unmount("/local-input");
    try {
      await ffmpeg.deleteDir("/local-input");
    } catch {
      // Some FFmpeg builds remove the mount point as part of unmounting.
    }
    return;
  }
  try {
    await ffmpeg.deleteFile(inputPath);
  } catch {
    // The fallback source may already have been deleted.
  }
}

function parseJsonFile(bytes) {
  const decoder = new TextDecoder();
  return JSON.parse(decoder.decode(bytes));
}

function positiveNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

export function formatVideoMetadata(metadata) {
  const {
    video,
    audio,
    width,
    height,
    duration,
    frameRate,
    bitrate,
    colorSpace,
    colorPrimaries,
    colorTransfer,
    pixelFormat,
    bitDepth,
  } = metadata;
  return {
    resolution: width && height ? `${width} × ${height}` : t("common.unknown"),
    fps: formatFps(frameRate),
    duration: formatDuration(duration),
    codec: video.codec_name || t("common.unknown"),
    bitrate: formatBitrate(bitrate),
    color: `${colorSpace} / ${colorPrimaries} / ${colorTransfer} · ${bitDepth ? `${bitDepth}-bit` : t("common.depthUnknown")}`,
    pixfmt: pixelFormat,
    audio: audio.length
      ? audio.map((stream) => `${stream.codec_name || t("analysis.audio")}${stream.channels ? ` · ${stream.channels} ${t("common.channels")}` : ""}`).join(", ")
      : t("common.noAudio"),
  };
}

export async function analyzeVideo(file, inputName) {
  const ffmpeg = await getFFmpeg();
  const metadataName = "probe.json";

  try {
    try {
      await ffmpeg.deleteFile(metadataName);
    } catch {
      // The first analysis has no previous probe output.
    }
    await ffmpeg.ffprobe([
      "-v", "error",
      "-show_format",
      "-show_streams",
      "-print_format", "json",
      inputName,
      "-o", metadataName,
    ]);
    let raw;
    try {
      raw = parseJsonFile(await ffmpeg.readFile(metadataName));
    } catch {
      throw new Error("The video could not be analyzed. Its container or one of its codecs may not be supported by this FFmpeg build.");
    }

    const video = (raw.streams || []).find((stream) => stream.codec_type === "video");
    if (!video) throw new Error("No video stream was found in this file.");
    const audio = (raw.streams || []).filter((stream) => stream.codec_type === "audio");
    const duration = positiveNumber(video.duration) || positiveNumber(raw.format?.duration);
    const frameRate = parseFrameRate(video.avg_frame_rate) || parseFrameRate(video.r_frame_rate);
    const audioBitrate = audio.reduce((total, stream) => total + (positiveNumber(stream.bit_rate) || 0), 0);
    const containerBitrate = positiveNumber(raw.format?.bit_rate);
    const bitrate = positiveNumber(video.bit_rate)
      || (containerBitrate ? Math.max(0, containerBitrate - audioBitrate) : null);
    const colorSpace = video.color_space || "unknown";
    const colorPrimaries = video.color_primaries || "unknown";
    const colorTransfer = video.color_transfer || "unknown";
    const pixelFormat = video.pix_fmt || "unknown";
    const explicitPixelDepth = pixelFormat.match(/(?:p|gbrp)(10|12|14|16|9|8)(?:le|be)?$/i);
    const knownEightBitFormat = /^(?:yuv|yuva|yuvj)\d{3,4}p$|^(?:nv12|nv21|yuyv422|uyvy422|rgb24|bgr24|rgba|bgra)$/i.test(pixelFormat);
    const bitDepth = positiveNumber(video.bits_per_raw_sample)
      || (explicitPixelDepth ? Number(explicitPixelDepth[1]) : null)
      || (knownEightBitFormat ? 8 : null);
    const hdrTransfer = /smpte2084|arib-std-b67|smpte st 2084|hlg/i.test(colorTransfer);
    const colorMetadataInferred = colorSpace === "bt709"
      && colorPrimaries === "unknown"
      && colorTransfer === "unknown";
    const isBT709 = colorSpace === "bt709"
      && (colorPrimaries === "bt709" || colorPrimaries === "unknown")
      && (colorTransfer === "bt709" || colorTransfer === "unknown")
      && !hdrTransfer;
    const isSDR = isBT709 && bitDepth !== null && bitDepth <= 10;

    const metadata = {
      raw,
      video,
      audio,
      width: positiveNumber(video.width),
      height: positiveNumber(video.height),
      duration,
      frameRate,
      bitrate,
      colorSpace,
      colorPrimaries,
      colorTransfer,
      pixelFormat,
      bitDepth,
      isSDR,
      colorMetadataInferred,
    };
    metadata.display = formatVideoMetadata(metadata);
    return metadata;
  } finally {
    try {
      await ffmpeg.deleteFile(metadataName);
    } catch (error) {
      console.warn("Could not remove temporary probe output.", error);
    }
  }
}

export async function verifyDecoder(inputName) {
  const ffmpeg = await getFFmpeg();
  const code = await ffmpeg.exec([
    "-v", "error",
    "-i", inputName,
    "-map", "0:v:0",
    "-frames:v", "1",
    "-f", "null",
    "-",
  ]);
  if (code !== 0) {
    throw new Error("FFmpeg could not decode a video frame. This file may use a codec that is unavailable in the browser's FFmpeg build.");
  }
}
