const LANGUAGE_STORAGE_KEY = "hdr-patcher-language";
const LANGUAGES = new Set(["en", "ko"]);

const translations = {
  en: {
    "document.title": "HDR Patcher — Local SDR to HDR10",
    "meta.description": "Convert BT.709 SDR videos to 10-bit HEVC Main 10 HDR10-compatible video locally in your browser.",
    "brand.home": "HDR Patcher home",
    "navigation.main": "Main navigation",
    "navigation.home": "Home",
    "language.label": "Language",
    "hero.eyebrow": "SDR TO HDR10 · IN YOUR BROWSER",
    "hero.title.first": "Enhance Your",
    "hero.title.second": "Edit.",
    "hero.description": "Transform BT.709 SDR videos into 10-bit HEVC Main 10 HDR10-compatible video.",
    "hero.privacy": "Your video stays on your device, from start to finish.",
    "workspace.label": "Video converter",
    "steps.upload": "Choose a video",
    "upload.formats": "MP4 · MKV · MOV · WEBM",
    "upload.dropzone": "Choose a video or drop it here",
    "upload.dropTitle": "Drop your video here",
    "upload.browse": "or browse files from your device",
    "upload.button": "Upload video",
    "upload.footnote": "Files are processed locally · No upload limits imposed by a server",
    "upload.remove": "Remove video",
    "steps.information": "Video information",
    "analysis.local": "ANALYZING LOCALLY",
    "analysis.resolution": "Resolution",
    "analysis.fps": "Frame rate",
    "analysis.duration": "Duration",
    "analysis.codec": "Video codec",
    "analysis.bitrate": "Video bitrate",
    "analysis.color": "Color / depth",
    "analysis.audio": "Audio",
    "analysis.pixelFormat": "Pixel format",
    "steps.settings": "HDR settings",
    "intensity.label": "HDR intensity",
    "intensity.subtle": "Subtle",
    "intensity.balanced": "Balanced",
    "intensity.bold": "Bold",
    "intensity.ariaValue": "{value} percent",
    "settings.peakHint": "Sets the nominal HDR peak from 100 to 1000 nits. Even at 0%, SDR is converted to 10-bit BT.2020 / PQ.",
    "settings.runtimeHint": "Uses multithreaded FFmpeg.wasm and libx265. Your browser must support service workers and cross-origin isolation; the first visit may reload once.",
    "steps.preview": "Before / after",
    "preview.play": "Play preview",
    "preview.pause": "Pause preview",
    "preview.playVideo": "Play video",
    "preview.pauseVideo": "Pause video",
    "preview.empty": "Choose a video to preview it here",
    "preview.original": "ORIGINAL",
    "preview.hdr": "HDR10 PREVIEW",
    "preview.comparison": "Comparison",
    "preview.comparisonAria": "Before and after comparison split",
    "preview.compareEmpty": "Complete a conversion to compare",
    "preview.compareReady": "Drag to compare original and HDR10-compatible video",
    "steps.processing": "Convert to 10-bit HDR",
    "process.progressAria": "Conversion progress",
    "process.ready": "Ready when you are",
    "process.initialHint": "Conversion runs on your device. Large files need substantial memory and processing time.",
    "process.start": "Start 10-bit processing",
    "process.cancel": "Cancel",
    "export.heading": "Your HDR10-compatible video is ready",
    "export.completed": "COMPLETED",
    "export.download": "Download video",
    "export.note": "Verified 10-bit HEVC Main 10 · BT.2020 · SMPTE ST 2084 (PQ). Mastering-display metadata is not synthesized; an 8-bit source has no extra source detail to recover.",
    "footer.privacy": "Your videos never leave your device.",
    "footer.powered": "100% Local Processing · Powered by FFmpeg.wasm",
    "footer.local": "Video files are read and processed only in this browser tab.",
    "common.unknown": "Unknown",
    "common.unknownSize": "Unknown size",
    "common.noAudio": "No audio",
    "common.channels": "ch",
    "common.depthUnknown": "depth unknown",
    "analysis.complete": "ANALYSIS COMPLETE",
    "analysis.loading": "LOADING FFMPEG",
    "analysis.failed": "ANALYSIS FAILED",
    "analysis.working": "ANALYZING LOCALLY",
    "status.ready": "Ready when you are",
    "status.loading": "Loading FFmpeg",
    "status.analyzing": "Analyzing video",
    "status.unsupportedInput": "Unsupported input",
    "status.unsupportedDimensions": "Unsupported dimensions",
    "status.readyToConvert": "Ready to convert",
    "status.couldNotAnalyze": "Could not analyze video",
    "status.preparing": "Preparing HDR10 conversion",
    "status.verifying": "Verifying video decoder",
    "status.processing": "Processing HDR10 video",
    "status.finalizing": "Finalizing output",
    "status.completed": "Completed",
    "status.unavailable": "HDR10 unavailable",
    "status.failed": "Conversion failed",
    "status.canceled": "Canceled",
    "message.initial": "Conversion runs on your device. Large files need substantial memory and processing time.",
    "message.loadingAnalysis": "Loading the multithreaded FFmpeg engine, then analyzing the video locally.",
    "message.onlySdr": "Only BT.709 SDR input with a supported bit depth can be converted.",
    "message.evenDimensions": "10-bit 4:2:0 HEVC requires even video dimensions; the source will not be resized.",
    "message.ready": "Ready to convert locally with zscale and the multithreaded libx265 Main 10 encoder.",
    "message.retryAnalysis": "Check that the file is a supported video and try again.",
    "message.preparing": "Preparing the local multithreaded FFmpeg encoder.",
    "message.decoding": "Decoding a source frame to confirm this build can read the video codec.",
    "message.encoding": "Processing locally with zscale and the multithreaded libx265 encoder.",
    "message.converting": "Converting BT.709 SDR to 10-bit BT.2020/PQ and encoding with x265",
    "message.verifying": "Verifying 10-bit HEVC Main 10 and HDR color signaling",
    "message.canceled": "Processing was canceled and the FFmpeg worker was terminated. Start again to retry.",
    "message.finished": "Finished in {duration}. Verified as 10-bit HEVC Main 10 with BT.2020/PQ signaling; mastering-display metadata is not synthesized.",
    "notice.inferred": "The file has BT.709 matrix metadata but omits primaries and transfer tags. Those missing tags are treated as BT.709 SDR; confirm this matches the source.",
    "notice.unsupported": "This video is HDR already, uses an unsupported color space, or has incomplete SDR metadata. It will not be converted.",
    "notice.evenDimensions": "10-bit 4:2:0 HEVC requires even dimensions. This converter will not resize the source video.",
    "errors.busy": "Wait for the current video operation to finish or cancel it first.",
    "errors.invalidVideo": "Choose a non-empty video file (MP4, MKV, MOV, WEBM, or another FFmpeg-readable format).",
    "errors.fileTooLarge": "This file exceeds the HDR10 path's 512 MiB memory limit. Try a smaller video.",
    "errors.onlySdr": "Only BT.709 SDR input can be converted to HDR10.",
    "errors.evenDimensions": "10-bit 4:2:0 HEVC requires even dimensions. This converter will not resize the source video.",
    "errors.cancelled": "Video processing was canceled.",
    "errors.noVideoStream": "No video stream was found in this file.",
    "errors.analyzeFailed": "The video could not be analyzed. Its container or one of its codecs may not be supported by this FFmpeg build.",
    "errors.decodeFailed": "FFmpeg could not decode a video frame. This file may use a codec that is unavailable in the browser's FFmpeg build.",
    "errors.mountFailed": "This FFmpeg core could not mount the file without copying it. Files larger than 512 MiB require WorkerFS support to protect browser memory.",
    "errors.browserUnsupported": "This browser does not support Web Workers and WebAssembly required for local conversion.",
    "errors.notIsolated": "This browser session is not cross-origin isolated. Enable service workers and reload the page to use the multithreaded HDR10 encoder.",
    "errors.ffmpegLoad": "FFmpeg failed to load. Check your connection and browser support, then try again.",
    "errors.assetLoad": "Could not load an FFmpeg resource. Check your connection and try again.",
    "errors.memory": "FFmpeg ran out of browser memory. Try a shorter or lower-resolution source video.",
    "errors.encode": "The local HDR10 encode failed.",
    "errors.verify": "The output did not verify as 10-bit HEVC Main 10 with BT.2020/PQ signaling. It will not be offered as HDR10.",
    "errors.emptyOutput": "The HDR10 encoder produced an empty output file.",
    "errors.operation": "The operation failed. Details: {details}",
    "errors.encodeDetails": "The local HDR10 encode failed. Details: {details}",
    "errors.loadDetails": "FFmpeg failed to load. Details: {details}",
    "errors.previewDetails": "Preview playback failed: {details}",
    "errors.previewUnsupported": "This browser cannot preview the source video codec. FFmpeg may still be able to analyze and convert it.",
    "errors.runtimeDetails": "HDR10 processing is unavailable. Details: {details}",
    "errors.cancelledByUser": "Processing was canceled and the FFmpeg worker was terminated. Start again to retry.",
  },
  ko: {
    "document.title": "HDR Patcher — 브라우저 SDR to HDR10 변환",
    "meta.description": "BT.709 SDR 영상을 브라우저에서 로컬로 10-bit HEVC Main 10 HDR10 호환 영상으로 변환합니다.",
    "brand.home": "HDR Patcher 홈",
    "navigation.main": "주요 메뉴",
    "navigation.home": "홈",
    "language.label": "언어",
    "hero.eyebrow": "SDR TO HDR10 · 브라우저에서 처리",
    "hero.title.first": "영상 편집을",
    "hero.title.second": "더 강력하게.",
    "hero.description": "BT.709 SDR 영상을 10-bit HEVC Main 10 HDR10 호환 영상으로 변환합니다.",
    "hero.privacy": "영상은 처음부터 끝까지 기기 밖으로 나가지 않습니다.",
    "workspace.label": "동영상 변환기",
    "steps.upload": "동영상 선택",
    "upload.formats": "MP4 · MKV · MOV · WEBM",
    "upload.dropzone": "동영상을 선택하거나 여기에 놓으세요",
    "upload.dropTitle": "동영상을 여기에 놓으세요",
    "upload.browse": "또는 기기에서 파일 선택",
    "upload.button": "동영상 업로드",
    "upload.footnote": "파일은 브라우저에서만 처리됩니다 · 서버 업로드 제한 없음",
    "upload.remove": "동영상 제거",
    "steps.information": "동영상 정보",
    "analysis.local": "로컬에서 분석 중",
    "analysis.resolution": "해상도",
    "analysis.fps": "프레임 레이트",
    "analysis.duration": "재생 시간",
    "analysis.codec": "비디오 코덱",
    "analysis.bitrate": "비디오 비트레이트",
    "analysis.color": "색상 / 비트 심도",
    "analysis.audio": "오디오",
    "analysis.pixelFormat": "픽셀 포맷",
    "steps.settings": "HDR 설정",
    "intensity.label": "HDR 강도",
    "intensity.subtle": "은은하게",
    "intensity.balanced": "균형 있게",
    "intensity.bold": "강하게",
    "intensity.ariaValue": "{value}퍼센트",
    "settings.peakHint": "HDR 기준 피크 밝기를 100~1000 nit로 설정합니다. 0%에서도 SDR 픽셀을 10-bit BT.2020 / PQ로 변환합니다.",
    "settings.runtimeHint": "멀티스레드 FFmpeg.wasm과 libx265를 사용합니다. 브라우저에서 서비스 워커와 교차 출처 격리를 지원해야 하며, 첫 방문 시 한 번 새로고침될 수 있습니다.",
    "steps.preview": "변환 전 / 후 비교",
    "preview.play": "미리보기 재생",
    "preview.pause": "미리보기 일시정지",
    "preview.playVideo": "동영상 재생",
    "preview.pauseVideo": "동영상 일시정지",
    "preview.empty": "미리 볼 동영상을 선택하세요",
    "preview.original": "원본",
    "preview.hdr": "HDR10 미리보기",
    "preview.comparison": "비교 위치",
    "preview.comparisonAria": "변환 전후 비교 분할 위치",
    "preview.compareEmpty": "변환을 완료하면 비교할 수 있습니다",
    "preview.compareReady": "슬라이더를 움직여 원본과 HDR10 호환 영상을 비교하세요",
    "steps.processing": "10-bit HDR로 변환",
    "process.progressAria": "변환 진행률",
    "process.ready": "준비되면 시작하세요",
    "process.initialHint": "변환은 기기에서 실행됩니다. 큰 파일은 많은 메모리와 처리 시간이 필요합니다.",
    "process.start": "10-bit 변환 시작",
    "process.cancel": "취소",
    "export.heading": "HDR10 호환 영상이 준비되었습니다",
    "export.completed": "완료",
    "export.download": "동영상 다운로드",
    "export.note": "10-bit HEVC Main 10 · BT.2020 · SMPTE ST 2084 (PQ) 검증 완료. 마스터링 디스플레이 메타데이터는 생성하지 않습니다. 8-bit 원본에 없는 세부 정보는 복원할 수 없습니다.",
    "footer.privacy": "영상은 기기 밖으로 나가지 않습니다.",
    "footer.powered": "100% 로컬 처리 · FFmpeg.wasm 기반",
    "footer.local": "동영상 파일은 이 브라우저 탭에서만 읽고 처리합니다.",
    "common.unknown": "알 수 없음",
    "common.unknownSize": "크기 알 수 없음",
    "common.noAudio": "오디오 없음",
    "common.channels": "채널",
    "common.depthUnknown": "비트 심도 알 수 없음",
    "analysis.complete": "분석 완료",
    "analysis.loading": "FFMPEG 로딩 중",
    "analysis.failed": "분석 실패",
    "analysis.working": "로컬에서 분석 중",
    "status.ready": "준비되면 시작하세요",
    "status.loading": "FFmpeg 로딩 중",
    "status.analyzing": "동영상 분석 중",
    "status.unsupportedInput": "지원하지 않는 입력",
    "status.unsupportedDimensions": "지원하지 않는 해상도",
    "status.readyToConvert": "변환 준비 완료",
    "status.couldNotAnalyze": "동영상 분석 실패",
    "status.preparing": "HDR10 변환 준비 중",
    "status.verifying": "비디오 디코더 확인 중",
    "status.processing": "HDR10 영상 처리 중",
    "status.finalizing": "결과물 마무리 중",
    "status.completed": "완료",
    "status.unavailable": "HDR10 변환을 사용할 수 없음",
    "status.failed": "변환 실패",
    "status.canceled": "취소됨",
    "message.initial": "변환은 기기에서 실행됩니다. 큰 파일은 많은 메모리와 처리 시간이 필요합니다.",
    "message.loadingAnalysis": "멀티스레드 FFmpeg를 불러온 뒤 동영상을 로컬에서 분석합니다.",
    "message.onlySdr": "지원되는 비트 심도의 BT.709 SDR 영상만 변환할 수 있습니다.",
    "message.evenDimensions": "10-bit 4:2:0 HEVC는 짝수 해상도가 필요합니다. 원본 크기는 변경하지 않습니다.",
    "message.ready": "zscale과 멀티스레드 libx265 Main 10 인코더로 로컬 변환을 진행할 수 있습니다.",
    "message.retryAnalysis": "지원되는 동영상인지 확인한 뒤 다시 시도하세요.",
    "message.preparing": "로컬 멀티스레드 FFmpeg 인코더를 준비합니다.",
    "message.decoding": "이 빌드가 비디오 코덱을 읽을 수 있는지 프레임을 디코딩해 확인합니다.",
    "message.encoding": "zscale과 멀티스레드 libx265 인코더로 로컬에서 처리합니다.",
    "message.converting": "BT.709 SDR을 10-bit BT.2020/PQ로 변환하고 x265로 인코딩합니다",
    "message.verifying": "10-bit HEVC Main 10 및 HDR 색상 신호를 확인합니다",
    "message.canceled": "변환을 취소하고 FFmpeg 작업자를 종료했습니다. 다시 시작하면 재시도합니다.",
    "message.finished": "{duration} 소요. 10-bit HEVC Main 10 및 BT.2020/PQ 신호를 확인했습니다. 마스터링 디스플레이 메타데이터는 생성하지 않습니다.",
    "notice.inferred": "BT.709 매트릭스 정보는 있지만 원색 및 전달 특성 태그가 없습니다. 누락된 태그를 BT.709 SDR로 간주했습니다. 원본에 해당하는지 확인하세요.",
    "notice.unsupported": "이미 HDR이거나 지원하지 않는 색 공간 또는 불완전한 SDR 메타데이터를 사용하는 영상입니다. 변환하지 않습니다.",
    "notice.evenDimensions": "10-bit 4:2:0 HEVC에는 짝수 해상도가 필요합니다. 원본 크기를 변경하지 않습니다.",
    "errors.busy": "현재 동영상 작업이 끝날 때까지 기다리거나 먼저 취소하세요.",
    "errors.invalidVideo": "비어 있지 않은 동영상 파일을 선택하세요 (MP4, MKV, MOV, WEBM 또는 FFmpeg에서 읽을 수 있는 형식).",
    "errors.fileTooLarge": "이 파일은 HDR10 변환의 메모리 한도인 512 MiB를 초과합니다. 더 작은 영상을 선택하세요.",
    "errors.onlySdr": "BT.709 SDR 영상만 HDR10으로 변환할 수 있습니다.",
    "errors.evenDimensions": "10-bit 4:2:0 HEVC에는 짝수 해상도가 필요합니다. 원본 크기를 변경하지 않습니다.",
    "errors.cancelled": "동영상 처리가 취소되었습니다.",
    "errors.noVideoStream": "파일에서 비디오 스트림을 찾을 수 없습니다.",
    "errors.analyzeFailed": "동영상을 분석할 수 없습니다. 컨테이너 또는 코덱이 현재 FFmpeg 빌드에서 지원되지 않을 수 있습니다.",
    "errors.decodeFailed": "FFmpeg가 비디오 프레임을 디코딩하지 못했습니다. 브라우저용 FFmpeg 빌드에서 지원하지 않는 코덱일 수 있습니다.",
    "errors.mountFailed": "파일을 복사하지 않고 FFmpeg에 연결하지 못했습니다. 브라우저 메모리 보호를 위해 512 MiB 초과 파일에는 WorkerFS 지원이 필요합니다.",
    "errors.browserUnsupported": "이 브라우저는 로컬 변환에 필요한 Web Workers 또는 WebAssembly를 지원하지 않습니다.",
    "errors.notIsolated": "브라우저가 교차 출처 격리 상태가 아닙니다. 서비스 워커를 허용하고 새로고침한 뒤 멀티스레드 HDR10 인코더를 사용하세요.",
    "errors.ffmpegLoad": "FFmpeg를 불러오지 못했습니다. 연결과 브라우저 지원을 확인한 뒤 다시 시도하세요.",
    "errors.assetLoad": "FFmpeg 리소스를 불러오지 못했습니다. 인터넷 연결을 확인한 뒤 다시 시도하세요.",
    "errors.memory": "브라우저 메모리가 부족합니다. 더 짧거나 해상도가 낮은 영상을 사용해 보세요.",
    "errors.encode": "로컬 HDR10 인코딩에 실패했습니다.",
    "errors.verify": "출력이 10-bit HEVC Main 10 및 BT.2020/PQ 신호 검증을 통과하지 못해 HDR10 결과물로 제공할 수 없습니다.",
    "errors.emptyOutput": "HDR10 인코더가 빈 결과 파일을 만들었습니다.",
    "errors.operation": "작업에 실패했습니다. 세부 정보: {details}",
    "errors.encodeDetails": "로컬 HDR10 인코딩에 실패했습니다. 세부 정보: {details}",
    "errors.loadDetails": "FFmpeg를 불러오지 못했습니다. 세부 정보: {details}",
    "errors.previewDetails": "미리보기를 재생하지 못했습니다: {details}",
    "errors.previewUnsupported": "이 브라우저는 원본 비디오 코덱을 미리보기로 재생할 수 없습니다. FFmpeg에서는 분석 및 변환이 가능할 수 있습니다.",
    "errors.runtimeDetails": "HDR10 처리를 사용할 수 없습니다. 세부 정보: {details}",
    "errors.cancelledByUser": "변환을 취소하고 FFmpeg 작업자를 종료했습니다. 다시 시작하면 재시도합니다.",
  },
};

let currentLanguage = "en";
const translationValues = new WeakMap();

function interpolate(template, values) {
  return template.replace(/\{(\w+)\}/g, (_match, name) => String(values[name] ?? ""));
}

function applyTranslations(root = document) {
  const nodes = [];
  if (root instanceof Element && root.matches("[data-i18n], [data-i18n-aria-label], [data-i18n-title], [data-i18n-content]")) {
    nodes.push(root);
  }
  nodes.push(...root.querySelectorAll("[data-i18n], [data-i18n-aria-label], [data-i18n-title], [data-i18n-content]"));

  for (const element of nodes) {
    const textKey = element.dataset.i18n;
    if (textKey) element.textContent = t(textKey, translationValues.get(element));
    const ariaLabelKey = element.dataset.i18nAriaLabel;
    if (ariaLabelKey) element.setAttribute("aria-label", t(ariaLabelKey));
    const titleKey = element.dataset.i18nTitle;
    if (titleKey) element.setAttribute("title", t(titleKey));
    const contentKey = element.dataset.i18nContent;
    if (contentKey) element.setAttribute("content", t(contentKey));
  }
}

export function t(key, values = {}) {
  const message = translations[currentLanguage][key] || translations.en[key] || key;
  return interpolate(message, values);
}

export function setText(element, key, values = {}) {
  element.dataset.i18n = key;
  translationValues.set(element, values);
  element.textContent = t(key, values);
}

export function getErrorTranslation(error) {
  const message = error instanceof Error ? error.message : String(error);
  const exactErrors = [
    ["This browser does not support Web Workers", "errors.browserUnsupported"],
    ["This browser session is not cross-origin isolated", "errors.notIsolated"],
    ["This FFmpeg core could not mount", "errors.mountFailed"],
    ["The video could not be analyzed", "errors.analyzeFailed"],
    ["No video stream was found", "errors.noVideoStream"],
    ["FFmpeg could not decode a video frame", "errors.decodeFailed"],
    ["FFmpeg ran out of browser memory", "errors.memory"],
    ["Only BT.709 SDR input", "errors.onlySdr"],
    ["10-bit 4:2:0 HEVC requires even dimensions", "errors.evenDimensions"],
    ["This file exceeds the HDR10 path", "errors.fileTooLarge"],
    ["Video processing was canceled", "errors.cancelled"],
    ["The output did not verify as 10-bit HEVC", "errors.verify"],
    ["The HDR10 encoder produced an empty output file", "errors.emptyOutput"],
  ];
  const exact = exactErrors.find(([prefix]) => message.startsWith(prefix));
  if (exact) return { key: exact[1], values: {} };
  if (message.startsWith("FFmpeg failed to load.")) {
    const details = message.slice("FFmpeg failed to load.".length).trim();
    return details
      ? { key: "errors.loadDetails", values: { details } }
      : { key: "errors.ffmpegLoad", values: {} };
  }
  if (message.startsWith("Could not load FFmpeg asset") || message.startsWith("Could not load FFmpeg worker")) {
    return { key: "errors.assetLoad", values: {} };
  }
  if (message.startsWith("The local HDR10 encode failed.")) {
    const details = message.slice("The local HDR10 encode failed.".length).trim();
    return details
      ? { key: "errors.encodeDetails", values: { details } }
      : { key: "errors.encode", values: {} };
  }
  return { key: "errors.operation", values: { details: message } };
}

export function getNumberLocale() {
  return currentLanguage === "ko" ? "ko-KR" : "en-US";
}

export function initializeI18n() {
  let savedLanguage = null;
  try {
    savedLanguage = localStorage.getItem(LANGUAGE_STORAGE_KEY);
  } catch (error) {
    console.warn("Could not read the saved language preference.", error);
  }
  const browserLanguages = Array.isArray(navigator.languages) && navigator.languages.length
    ? navigator.languages
    : [navigator.language || "en"];
  const detectedLanguage = browserLanguages
    .map((language) => {
      if (/^ko(?:-|$)/i.test(language)) return "ko";
      if (/^en(?:-|$)/i.test(language)) return "en";
      return null;
    })
    .find((language) => language !== null) || "en";
  currentLanguage = LANGUAGES.has(savedLanguage) ? savedLanguage : detectedLanguage;
  document.documentElement.lang = currentLanguage;
  applyTranslations();

  const selector = document.querySelector("#language-select");
  if (selector) {
    selector.value = currentLanguage;
    selector.addEventListener("change", () => {
      if (!LANGUAGES.has(selector.value)) return;
      currentLanguage = selector.value;
      document.documentElement.lang = currentLanguage;
      applyTranslations();
      try {
        localStorage.setItem(LANGUAGE_STORAGE_KEY, currentLanguage);
      } catch (error) {
        console.warn("Could not save the language preference.", error);
      }
      document.dispatchEvent(new CustomEvent("app-language-change", {
        detail: { language: currentLanguage },
      }));
    });
  }
}
