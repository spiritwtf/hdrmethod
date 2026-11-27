import { getFFmpeg, terminateFFmpeg } from "./ffmpeg.js";
import { analyzeVideo, mountInputFile, releaseInputFile, verifyDecoder } from "./video-analyzer.js";
import { cancelHDRProcessing, processHDR10 } from "./hdr-processor.js";
import {
  formatBytes,
  formatDuration,
  isSupportedVideoFile,
  safeOutputBaseName,
} from "./utils.js";

const elements = {
  dropzone: document.querySelector("#dropzone"),
  fileInput: document.querySelector("#file-input"),
  chooseButton: document.querySelector("#choose-button"),
  fileRow: document.querySelector("#file-row"),
  fileName: document.querySelector("#file-name"),
  fileSize: document.querySelector("#file-size"),
  removeFile: document.querySelector("#remove-file"),
  infoCard: document.querySelector("#info-card"),
  analysisStatus: document.querySelector("#analysis-status"),
  compatibilityNotice: document.querySelector("#compatibility-notice"),
  intensity: document.querySelector("#intensity"),
  intensityValue: document.querySelector("#intensity-value"),
  originalPreview: document.querySelector("#original-preview"),
  hdrPreview: document.querySelector("#hdr-preview"),
  compareOverlay: document.querySelector("#compare-overlay"),
  compareRange: document.querySelector("#compare-range"),
  compareDivider: document.querySelector("#compare-divider"),
  compareNote: document.querySelector("#compare-note"),
  previewEmpty: document.querySelector("#preview-empty"),
  playToggle: document.querySelector("#play-toggle"),
  startButton: document.querySelector("#start-button"),
  cancelButton: document.querySelector("#cancel-button"),
  processStatus: document.querySelector("#process-status-text"),
  statusDot: document.querySelector("#status-dot"),
  progressValue: document.querySelector("#progress-value"),
  progressFill: document.querySelector("#progress-fill"),
  progressTrack: document.querySelector("#progress-track"),
  processMessage: document.querySelector("#process-message"),
  elapsedTime: document.querySelector("#elapsed-time"),
  exportCard: document.querySelector("#export-card"),
  exportPreview: document.querySelector("#export-preview"),
  outputName: document.querySelector("#output-name"),
  outputStats: document.querySelector("#output-stats"),
  downloadButton: document.querySelector("#download-button"),
  toast: document.querySelector("#toast"),
};

const metadataElements = {
  resolution: document.querySelector("#meta-resolution"),
  fps: document.querySelector("#meta-fps"),
  duration: document.querySelector("#meta-duration"),
  codec: document.querySelector("#meta-codec"),
  bitrate: document.querySelector("#meta-bitrate"),
  color: document.querySelector("#meta-color"),
  pixfmt: document.querySelector("#meta-pixfmt"),
  audio: document.querySelector("#meta-audio"),
};

const state = {
  file: null,
  sourceName: null,
  inputName: null,
  inputMounted: false,
  metadata: null,
  sourceUrl: null,
  outputUrl: null,
  busy: false,
  generation: 0,
  startedAt: null,
  timer: null,
  toastTimer: null,
  syncingPreview: false,
  processingAbortController: null,
};

function showToast(message) {
  elements.toast.textContent = message;
  elements.toast.classList.remove("hidden");
  clearTimeout(state.toastTimer);
  state.toastTimer = setTimeout(() => elements.toast.classList.add("hidden"), 7000);
}

function setStatus(message, mode = "idle") {
  elements.processStatus.textContent = message;
  elements.statusDot.className = `status-dot${mode === "active" ? " active" : mode === "success" ? " success" : ""}`;
}

function setProgress(percent) {
  const clamped = Math.max(0, Math.min(100, percent));
  elements.progressFill.style.width = `${clamped}%`;
  elements.progressTrack.setAttribute("aria-valuenow", String(Math.round(clamped)));
  elements.progressValue.textContent = `${Math.round(clamped)}%`;
}

function setIndeterminateProgress() {
  elements.progressFill.style.width = "35%";
  elements.progressFill.classList.add("indeterminate");
  elements.progressTrack.removeAttribute("aria-valuenow");
  elements.progressValue.textContent = "…";
}

function clearIndeterminateProgress() {
  elements.progressFill.classList.remove("indeterminate");
  elements.progressFill.style.width = "0";
  elements.progressTrack.setAttribute("aria-valuenow", "0");
  elements.progressValue.textContent = "—";
}

function updateElapsed() {
  if (!state.startedAt) return;
  elements.elapsedTime.textContent = formatDuration((Date.now() - state.startedAt) / 1000);
}

function setBusy(busy) {
  state.busy = busy;
  elements.startButton.disabled = busy || !state.file || !state.metadata?.isSDR;
  elements.chooseButton.disabled = busy;
  elements.removeFile.disabled = busy;
  elements.cancelButton.classList.toggle("hidden", !busy);
  if (busy) {
    state.startedAt = Date.now();
    clearInterval(state.timer);
    state.timer = setInterval(updateElapsed, 500);
  } else {
    clearInterval(state.timer);
    state.timer = null;
    state.startedAt = null;
  }
}

function safeInputName(file) {
  const extension = file.name.match(/\.([a-z0-9]{1,8})$/i)?.[1]?.toLowerCase() || "bin";
  return `source.${extension}`;
}

function clearOutput() {
  if (state.outputUrl) URL.revokeObjectURL(state.outputUrl);
  state.outputUrl = null;
  elements.exportPreview.removeAttribute("src");
  elements.exportPreview.load();
  elements.downloadButton.removeAttribute("href");
  elements.exportCard.classList.add("hidden");
}

function renderMetadata(metadata) {
  Object.entries(metadata.display).forEach(([key, value]) => {
    if (metadataElements[key]) metadataElements[key].textContent = value;
  });
  elements.analysisStatus.textContent = "ANALYSIS COMPLETE";
  elements.compatibilityNotice.classList.add("hidden");
  if (metadata.colorMetadataInferred) {
    elements.compatibilityNotice.textContent =
      "The file has BT.709 matrix metadata but omits primaries and transfer tags. Those missing tags are treated as BT.709 SDR; confirm this matches the source.";
    elements.compatibilityNotice.classList.remove("hidden");
  } else if (!metadata.isSDR) {
    elements.compatibilityNotice.textContent =
      "This video is HDR already, uses an unsupported color space, or has incomplete SDR metadata. It will not be converted.";
    elements.compatibilityNotice.classList.remove("hidden");
  }
  elements.startButton.disabled = !metadata.isSDR || state.busy;
}

function clearFileState() {
  if (state.sourceUrl) URL.revokeObjectURL(state.sourceUrl);
  state.sourceUrl = null;
  state.file = null;
  state.sourceName = null;
  state.metadata = null;
  state.inputName = null;
  state.inputMounted = false;
  elements.fileInput.value = "";
  elements.fileRow.classList.add("hidden");
  elements.infoCard.classList.add("hidden");
  elements.originalPreview.removeAttribute("src");
  elements.hdrPreview.removeAttribute("src");
  elements.originalPreview.load();
  elements.hdrPreview.load();
  elements.previewEmpty.classList.remove("hidden");
  elements.playToggle.disabled = true;
  elements.compareRange.disabled = true;
  elements.compareNote.textContent = "Complete a conversion to compare";
  elements.compareDivider.classList.add("hidden");
  elements.compareOverlay.style.clipPath = "inset(0 0 0 50%)";
  clearOutput();
  elements.startButton.disabled = true;
  clearIndeterminateProgress();
  setStatus("Ready when you are");
  elements.processMessage.textContent = "Conversion runs on your device. Large files need substantial memory and processing time.";
  elements.elapsedTime.textContent = "00:00";
}

async function selectFile(file) {
  if (state.busy) {
    showToast("Wait for the current video operation to finish or cancel it first.");
    return;
  }
  if (!isSupportedVideoFile(file)) {
    showToast("Choose a non-empty video file (MP4, MKV, MOV, WEBM, or another FFmpeg-readable format).");
    return;
  }
  if (file.size > 512 * 1024 * 1024) {
    showToast("This file exceeds the HDR10 path's 512 MiB memory limit. Try a smaller video.");
    return;
  }

  clearFileState();
  const generation = ++state.generation;
  state.file = file;
  state.sourceName = safeInputName(file);
  state.sourceUrl = URL.createObjectURL(file);
  elements.fileName.textContent = file.name;
  elements.fileSize.textContent = formatBytes(file.size);
  elements.fileRow.classList.remove("hidden");
  elements.infoCard.classList.remove("hidden");
  elements.analysisStatus.textContent = "LOADING FFMPEG";
  elements.originalPreview.src = state.sourceUrl;
  elements.previewEmpty.classList.add("hidden");
  elements.playToggle.disabled = false;
  elements.playToggle.innerHTML = '<span aria-hidden="true">▶</span> Play video';
  elements.startButton.disabled = true;
  elements.processMessage.textContent = "Loading the single-threaded FFmpeg engine, then analyzing the video locally.";
  setIndeterminateProgress();
  setStatus("Loading FFmpeg", "active");
  setBusy(true);

  try {
    await getFFmpeg();
    if (generation !== state.generation) return;
    elements.analysisStatus.textContent = "ANALYZING LOCALLY";
    setStatus("Analyzing video", "active");
    const mountedInput = await mountInputFile(file, state.sourceName);
    state.inputName = mountedInput.inputPath;
    state.inputMounted = mountedInput.mounted;
    if (generation !== state.generation) return;
    const metadata = await analyzeVideo(file, state.inputName);
    if (generation !== state.generation) return;
    state.metadata = metadata;
    renderMetadata(metadata);
    if (!metadata.isSDR) {
      setStatus("Unsupported input");
      elements.processMessage.textContent = "Only BT.709 SDR input with a supported bit depth can be converted.";
    } else {
      setStatus("Ready to convert");
      elements.processMessage.textContent = "HDR10-compatible output requires a HEVC Main 10 encoder. This app will not fall back to 8-bit output.";
    }
    clearIndeterminateProgress();
  } catch (error) {
    if (generation !== state.generation) return;
    elements.analysisStatus.textContent = "ANALYSIS FAILED";
    elements.compatibilityNotice.textContent = error.message;
    elements.compatibilityNotice.classList.remove("hidden");
    elements.startButton.disabled = true;
    setStatus("Could not analyze video");
    elements.processMessage.textContent = "Check that the file is a supported video and try again.";
    clearIndeterminateProgress();
    showToast(error.message);
  } finally {
    if (generation === state.generation) {
      if (state.inputName) {
        try {
          await releaseInputFile(state.inputName, state.inputMounted);
        } catch (error) {
          console.warn("Could not release the analyzed input file.", error);
          terminateFFmpeg();
        }
        state.inputName = null;
        state.inputMounted = false;
      }
      setBusy(false);
    }
  }
}

async function startProcessing() {
  if (state.busy || !state.file || !state.metadata?.isSDR) return;
  const generation = ++state.generation;
  const file = state.file;
  let inputName = null;
  let inputMounted = false;
  const metadata = state.metadata;
  const outputName = "hdr-output.mp4";
  const intensity = Number(elements.intensity.value);
  const abortController = new AbortController();
  state.processingAbortController = abortController;
  clearOutput();
  setBusy(true);
  setProgress(0);
  setStatus("Preparing HDR10 conversion", "active");
  elements.processMessage.textContent = "Checking for a compatible HEVC Main 10 encoder.";

  try {
    await getFFmpeg();
    if (generation !== state.generation) return;
    const mountedInput = await mountInputFile(file, state.sourceName);
    inputName = mountedInput.inputPath;
    inputMounted = mountedInput.mounted;
    state.inputName = inputName;
    state.inputMounted = inputMounted;
    if (generation !== state.generation) return;
    setStatus("Verifying video decoder", "active");
    elements.processMessage.textContent = "Decoding a source frame to confirm this build can read the video codec.";
    await verifyDecoder(inputName);
    if (generation !== state.generation) return;

    setStatus("Processing HDR10 video", "active");
    elements.processMessage.textContent = "Processing locally with WebGPU and the browser's HEVC Main 10 encoder.";
    const output = await processHDR10({
      file,
      inputName,
      outputName,
      metadata,
      intensity,
      fileSize: file.size,
      signal: abortController.signal,
      onStatus: (message) => {
        if (generation !== state.generation) return;
        elements.processMessage.textContent = message;
      },
      onProgress: ({ ratio }) => {
        if (generation !== state.generation) return;
        if (ratio !== null && ratio >= 0 && ratio <= 1) setProgress(ratio * 100);
      },
    });
    if (generation !== state.generation) return;
    setStatus("Finalizing output", "active");
    state.outputUrl = URL.createObjectURL(new Blob([output], { type: "video/mp4" }));
    const outputFilename = `${safeOutputBaseName(file.name)}_HDR10.mp4`;
    elements.exportPreview.src = state.outputUrl;
    elements.outputName.textContent = outputFilename;
    elements.outputStats.textContent = `${formatBytes(output.byteLength)} · ${metadata.display.resolution} · ${metadata.display.fps}`;
    elements.downloadButton.href = state.outputUrl;
    elements.downloadButton.download = outputFilename;
    elements.exportCard.classList.remove("hidden");
    elements.hdrPreview.src = state.outputUrl;
    elements.hdrPreview.load();
    elements.compareRange.disabled = false;
    elements.compareDivider.classList.remove("hidden");
    elements.compareNote.textContent = "Drag to compare original and HDR10-compatible video";
    elements.playToggle.innerHTML = '<span aria-hidden="true">▶</span> Play preview';
    setProgress(100);
    setStatus("Completed", "success");
    elements.processMessage.textContent =
      `Finished in ${formatDuration((Date.now() - state.startedAt) / 1000)}. Verified as 10-bit HEVC Main 10 with BT.2020/PQ signaling; mastering-display metadata is not synthesized.`;
    elements.elapsedTime.textContent = formatDuration((Date.now() - state.startedAt) / 1000);
    elements.playToggle.disabled = false;
    elements.exportCard.scrollIntoView({ behavior: "smooth", block: "nearest" });
  } catch (error) {
    if (generation !== state.generation) return;
    const message = error.message;
    const encoderUnavailable = /HEVC Main 10 encoder/.test(message);
    setStatus(encoderUnavailable ? "HDR10 unavailable" : "Conversion failed");
    if (encoderUnavailable) {
      elements.compatibilityNotice.textContent = message;
      elements.compatibilityNotice.classList.remove("hidden");
    }
    elements.processMessage.textContent = message;
    showToast(message);
  } finally {
    if (generation === state.generation) {
      if (inputName) await cleanupFFmpegFiles(inputName, inputMounted, outputName);
      setBusy(false);
      state.processingAbortController = null;
    }
  }
}

async function cleanupFFmpegFiles(inputName, inputMounted, outputName) {
  try {
    const ffmpeg = await getFFmpeg();
    await releaseInputFile(inputName, inputMounted);
    state.inputName = null;
    state.inputMounted = false;
    for (const filename of [outputName, "probe.json", "hdr-verify.json"]) {
      try {
        await ffmpeg.deleteFile(filename);
      } catch {
        // A missing file is already clean.
      }
    }
  } catch (error) {
    console.warn("Could not clean up temporary FFmpeg files.", error);
    terminateFFmpeg();
    state.inputName = null;
    state.inputMounted = false;
  }
}

async function cancelProcessing() {
  if (!state.busy) return;
  state.generation += 1;
  state.processingAbortController?.abort();
  setBusy(false);
  try {
    await cancelHDRProcessing();
  } catch (error) {
    console.error("Could not cancel browser-accelerated conversion cleanly.", error);
    showToast(`GPU cancellation did not finish cleanly: ${error.message}`);
  }
  terminateFFmpeg();
  state.processingAbortController = null;
  state.inputName = null;
  state.inputMounted = false;
  clearIndeterminateProgress();
  setProgress(0);
  setStatus("Canceled");
  elements.processMessage.textContent = "Processing was canceled and its browser workers were stopped. Start again to retry.";
  elements.elapsedTime.textContent = "00:00";
}

function updateIntensity() {
  const value = Number(elements.intensity.value);
  elements.intensityValue.textContent = String(value);
  elements.intensity.setAttribute("aria-valuetext", `${value} percent`);
  elements.intensity.style.background = `linear-gradient(90deg, var(--accent) 0%, var(--accent) ${value}%, #303038 ${value}%, #303038 100%)`;
}

function updateComparison() {
  const split = Number(elements.compareRange.value);
  elements.compareOverlay.style.clipPath = `inset(0 0 0 ${split}%)`;
  elements.compareDivider.style.left = `${split}%`;
}

async function togglePreviewPlayback() {
  if (elements.originalPreview.paused) {
    try {
      await elements.originalPreview.play();
      if (state.outputUrl) {
        elements.hdrPreview.currentTime = elements.originalPreview.currentTime;
        await elements.hdrPreview.play();
      }
      elements.playToggle.innerHTML = state.outputUrl
        ? '<span aria-hidden="true">Ⅱ</span> Pause preview'
        : '<span aria-hidden="true">Ⅱ</span> Pause video';
    } catch (error) {
      showToast(`Preview playback failed: ${error.message}`);
    }
  } else {
    elements.originalPreview.pause();
    elements.hdrPreview.pause();
    elements.playToggle.innerHTML = state.outputUrl
      ? '<span aria-hidden="true">▶</span> Play preview'
      : '<span aria-hidden="true">▶</span> Play video';
  }
}

elements.chooseButton.addEventListener("click", () => elements.fileInput.click());
elements.dropzone.addEventListener("click", (event) => {
  if (event.target.closest("button")) return;
  elements.fileInput.click();
});
elements.dropzone.addEventListener("keydown", (event) => {
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    elements.fileInput.click();
  }
});
elements.fileInput.addEventListener("change", (event) => {
  const [file] = event.target.files;
  if (file) selectFile(file);
});
elements.removeFile.addEventListener("click", () => {
  if (state.busy) return;
  state.generation += 1;
  clearFileState();
});
elements.startButton.addEventListener("click", startProcessing);
elements.cancelButton.addEventListener("click", cancelProcessing);
elements.intensity.addEventListener("input", updateIntensity);
elements.compareRange.addEventListener("input", updateComparison);
elements.playToggle.addEventListener("click", togglePreviewPlayback);
elements.originalPreview.addEventListener("timeupdate", () => {
  if (state.syncingPreview || elements.hdrPreview.readyState < 2) return;
  if (Math.abs(elements.hdrPreview.currentTime - elements.originalPreview.currentTime) > 0.12) {
    state.syncingPreview = true;
    elements.hdrPreview.currentTime = elements.originalPreview.currentTime;
    state.syncingPreview = false;
  }
});
elements.originalPreview.addEventListener("ended", () => {
  elements.hdrPreview.pause();
  elements.playToggle.innerHTML = state.outputUrl
    ? '<span aria-hidden="true">▶</span> Play preview'
    : '<span aria-hidden="true">▶</span> Play video';
});
elements.originalPreview.addEventListener("error", () => {
  if (state.file) showToast("This browser cannot preview the source video codec. FFmpeg may still be able to analyze and convert it.");
});
elements.originalPreview.addEventListener("play", () => {
  if (state.outputUrl) elements.hdrPreview.play().catch(() => {});
});
elements.originalPreview.addEventListener("pause", () => elements.hdrPreview.pause());
elements.dropzone.addEventListener("dragover", (event) => {
  event.preventDefault();
  elements.dropzone.classList.add("drag-over");
});
elements.dropzone.addEventListener("dragleave", (event) => {
  if (!elements.dropzone.contains(event.relatedTarget)) elements.dropzone.classList.remove("drag-over");
});
elements.dropzone.addEventListener("drop", (event) => {
  event.preventDefault();
  elements.dropzone.classList.remove("drag-over");
  const [file] = event.dataTransfer.files;
  if (file) selectFile(file);
});
window.addEventListener("beforeunload", () => {
  clearInterval(state.timer);
  if (state.sourceUrl) URL.revokeObjectURL(state.sourceUrl);
  if (state.outputUrl) URL.revokeObjectURL(state.outputUrl);
  terminateFFmpeg();
});

updateIntensity();
updateComparison();
