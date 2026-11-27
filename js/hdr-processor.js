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

export async function processHDR10(options) {
  if (options.signal?.aborted) throw new Error("Video processing was canceled.");
  if (!options.metadata?.isSDR) {
    throw new Error("Only BT.709 SDR input can be converted to HDR10.");
  }
  const acceleration = await import("./accelerated-hdr-processor.js");
  if (options.signal?.aborted) throw new Error("Video processing was canceled.");
  return acceleration.processHDR10Accelerated(options);
}

export async function cancelHDRProcessing() {
  const { cancelHDRAcceleration } = await import("./accelerated-hdr-processor.js");
  await cancelHDRAcceleration();
}
