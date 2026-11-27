import { getFFmpeg, terminateFFmpeg } from "./ffmpeg.js";
import {
  analyzeVideo,
  formatVideoMetadata,
  mountInputFile,
  releaseInputFile,
  verifyDecoder,
} from "./video-analyzer.js";
import { processHDR10 } from "./hdr-processor.js";
import { getErrorTranslation, setText, t } from "./i18n.js";
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
  playToggleIcon: document.querySelector("#play-toggle-icon"),
  playToggleLabel: document.querySelector("#play-toggle-label"),
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
  outputSize: null,
  busy: false,
  generation: 0,
  startedAt: null,
  timer: null,
  toastTimer: null,
  syncingPreview: false,
  processingAbortController: null,
};

function showToast(key, values = {}) {
  setText(elements.toast, key, values);
  elements.toast.classList.remove("hidden");
  clearTimeout(state.toastTimer);
  state.toastTimer = setTimeout(() => elements.toast.classList.add("hidden"), 7000);
}

function setErrorText(element, error) {
  const translated = getErrorTranslation(error);
  setText(element, translated.key, translated.values);
  return translated;
}

function showErrorToast(error) {
  setErrorText(elements.toast, error);
  elements.toast.classList.remove("hidden");
  clearTimeout(state.toastTimer);
  state.toastTimer = setTimeout(() => elements.toast.classList.add("hidden"), 7000);
}

function setStatus(key, mode = "idle") {
  setText(elements.processStatus, key);
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
  elements.startButton.disabled = busy || !isConvertible();
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

function isConvertible() {
  return Boolean(
    state.file
    && state.metadata?.isSDR
    && state.metadata.width % 2 === 0
    && state.metadata.height % 2 === 0,
  );
}

function safeInputName(file) {
  const extension = file.name.match(/\.([a-z0-9]{1,8})$/i)?.[1]?.toLowerCase() || "bin";
  return `source.${extension}`;
}

function clearOutput() {
  if (state.outputUrl) URL.revokeObjectURL(state.outputUrl);
  state.outputUrl = null;
  state.outputSize = null;
  elements.exportPreview.removeAttribute("src");
  elements.exportPreview.load();
  elements.downloadButton.removeAttribute("href");
  elements.exportCard.classList.add("hidden");
}

function renderMetadataValues(metadata) {
  metadata.display = formatVideoMetadata(metadata);
  Object.entries(metadata.display).forEach(([key, value]) => {
    if (metadataElements[key]) metadataElements[key].textContent = value;
  });
}

function renderMetadata(metadata) {
  renderMetadataValues(metadata);
  setText(elements.analysisStatus, "analysis.complete");
  elements.compatibilityNotice.classList.add("hidden");
  if (metadata.colorMetadataInferred) {
    setText(elements.compatibilityNotice, "notice.inferred");
    elements.compatibilityNotice.classList.remove("hidden");
  } else if (!metadata.isSDR) {
    setText(elements.compatibilityNotice, "notice.unsupported");
    elements.compatibilityNotice.classList.remove("hidden");
  } else if (metadata.width % 2 !== 0 || metadata.height % 2 !== 0) {
    setText(elements.compatibilityNotice, "notice.evenDimensions");
    elements.compatibilityNotice.classList.remove("hidden");
  }
  elements.startButton.disabled = state.busy || !isConvertible();
}

function clearFileState() {
  if (state.sourceUrl) URL.revokeObjectURL(state.sourceUrl);
  state.sourceUrl = null;
  state.file = null;
  state.outputSize = null;
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
  setText(elements.compareNote, "preview.compareEmpty");
  elements.compareDivider.classList.add("hidden");
  elements.compareOverlay.style.clipPath = "inset(0 0 0 50%)";
  clearOutput();
  elements.compatibilityNotice.classList.add("hidden");
  elements.startButton.disabled = true;
  clearIndeterminateProgress();
  setStatus("status.ready");
  setText(elements.processMessage, "message.initial");
  elements.elapsedTime.textContent = "00:00";
}

async function selectFile(file) {
  if (state.busy) {
    showToast("errors.busy");
    return;
  }
  if (!isSupportedVideoFile(file)) {
    showToast("errors.invalidVideo");
    return;
  }
  if (file.size > 512 * 1024 * 1024) {
    showToast("errors.fileTooLarge");
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
  setText(elements.analysisStatus, "analysis.loading");
  elements.originalPreview.src = state.sourceUrl;
  elements.previewEmpty.classList.add("hidden");
  elements.playToggle.disabled = false;
  updatePlayToggleLabel(false);
  elements.startButton.disabled = true;
  setText(elements.processMessage, "message.loadingAnalysis");
  setIndeterminateProgress();
  setStatus("status.loading", "active");
  setBusy(true);

  try {
    await getFFmpeg();
    if (generation !== state.generation) return;
    setText(elements.analysisStatus, "analysis.working");
    setStatus("status.analyzing", "active");
    const mountedInput = await mountInputFile(file, state.sourceName);
    state.inputName = mountedInput.inputPath;
    state.inputMounted = mountedInput.mounted;
    if (generation !== state.generation) return;
    const metadata = await analyzeVideo(file, state.inputName);
    if (generation !== state.generation) return;
    state.metadata = metadata;
    renderMetadata(metadata);
    if (!metadata.isSDR) {
      setStatus("status.unsupportedInput");
      setText(elements.processMessage, "message.onlySdr");
    } else if (!isConvertible()) {
      setStatus("status.unsupportedDimensions");
      setText(elements.processMessage, "message.evenDimensions");
    } else {
      setStatus("status.readyToConvert");
      setText(elements.processMessage, "message.ready");
    }
    clearIndeterminateProgress();
  } catch (error) {
    if (generation !== state.generation) return;
    setText(elements.analysisStatus, "analysis.failed");
    setErrorText(elements.compatibilityNotice, error);
    elements.compatibilityNotice.classList.remove("hidden");
    elements.startButton.disabled = true;
    setStatus("status.couldNotAnalyze");
    setText(elements.processMessage, "message.retryAnalysis");
    clearIndeterminateProgress();
    showErrorToast(error);
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
  if (state.busy || !isConvertible()) return;
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
  setIndeterminateProgress();
  setStatus("status.preparing", "active");
  setText(elements.processMessage, "message.preparing");

  try {
    await getFFmpeg();
    if (generation !== state.generation) return;
    const mountedInput = await mountInputFile(file, state.sourceName);
    inputName = mountedInput.inputPath;
    inputMounted = mountedInput.mounted;
    state.inputName = inputName;
    state.inputMounted = inputMounted;
    if (generation !== state.generation) return;
    setStatus("status.verifying", "active");
    setText(elements.processMessage, "message.decoding");
    await verifyDecoder(inputName);
    if (generation !== state.generation) return;

    setStatus("status.processing", "active");
    setText(elements.processMessage, "message.encoding");
    const output = await processHDR10({
      inputName,
      outputName,
      metadata,
      intensity,
      fileSize: file.size,
      signal: abortController.signal,
      onStatus: (message) => {
        if (generation !== state.generation) return;
        setText(elements.processMessage, message);
      },
      onProgress: ({ ratio }) => {
        if (generation !== state.generation) return;
        if (ratio !== null && ratio >= 0 && ratio <= 1) {
          clearIndeterminateProgress();
          setProgress(ratio * 100);
        }
      },
    });
    if (generation !== state.generation) return;
    terminateFFmpeg();
    inputName = null;
    inputMounted = false;
    state.inputName = null;
    state.inputMounted = false;
    setStatus("status.finalizing", "active");
    state.outputUrl = URL.createObjectURL(new Blob([output], { type: "video/mp4" }));
    state.outputSize = output.byteLength;
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
    setText(elements.compareNote, "preview.compareReady");
    updatePlayToggleLabel(false);
    clearIndeterminateProgress();
    setProgress(100);
    setStatus("status.completed", "success");
    setText(elements.processMessage, "message.finished", {
      duration: formatDuration((Date.now() - state.startedAt) / 1000),
    });
    elements.elapsedTime.textContent = formatDuration((Date.now() - state.startedAt) / 1000);
    elements.playToggle.disabled = false;
    elements.exportCard.scrollIntoView({ behavior: "smooth", block: "nearest" });
  } catch (error) {
    if (generation !== state.generation) return;
    const message = error instanceof Error ? error.message : String(error);
    const runtimeUnavailable = /cross-origin isolated|SharedArrayBuffer|service worker/i.test(message);
    setStatus(runtimeUnavailable ? "status.unavailable" : "status.failed");
    if (runtimeUnavailable) {
      setErrorText(elements.compatibilityNotice, error);
      elements.compatibilityNotice.classList.remove("hidden");
    }
    setErrorText(elements.processMessage, error);
    showErrorToast(error);
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
  terminateFFmpeg();
  state.processingAbortController = null;
  state.inputName = null;
  state.inputMounted = false;
  clearIndeterminateProgress();
  setProgress(0);
  setStatus("status.canceled");
  setText(elements.processMessage, "message.canceled");
  elements.elapsedTime.textContent = "00:00";
}

function updateIntensity() {
  const value = Number(elements.intensity.value);
  elements.intensityValue.textContent = String(value);
  elements.intensity.setAttribute("aria-valuetext", t("intensity.ariaValue", { value }));
  elements.intensity.style.background = `linear-gradient(90deg, var(--accent) 0%, var(--accent) ${value}%, #303038 ${value}%, #303038 100%)`;
}

function updatePlayToggleLabel(isPlaying) {
  elements.playToggleIcon.textContent = isPlaying ? "Ⅱ" : "▶";
  const key = state.outputUrl
    ? (isPlaying ? "preview.pause" : "preview.play")
    : (isPlaying ? "preview.pauseVideo" : "preview.playVideo");
  setText(elements.playToggleLabel, key);
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
      updatePlayToggleLabel(true);
    } catch (error) {
      showToast("errors.previewDetails", {
        details: error instanceof Error ? error.message : String(error),
      });
    }
  } else {
    elements.originalPreview.pause();
    elements.hdrPreview.pause();
    updatePlayToggleLabel(false);
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
document.addEventListener("app-language-change", () => {
  updateIntensity();
  if (state.file) elements.fileSize.textContent = formatBytes(state.file.size);
  if (state.metadata) renderMetadataValues(state.metadata);
  if (state.outputSize !== null && state.metadata) {
    elements.outputStats.textContent =
      `${formatBytes(state.outputSize)} · ${state.metadata.display.resolution} · ${state.metadata.display.fps}`;
  }
  updatePlayToggleLabel(!elements.originalPreview.paused);
});
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
  updatePlayToggleLabel(false);
});
elements.originalPreview.addEventListener("error", () => {
  if (state.file) showToast("errors.previewUnsupported");
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
