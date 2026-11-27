const FFMPEG_VERSION = "0.12.15";
const CORE_VERSION = "0.12.10";
const FFMPEG_BASE = `https://cdn.jsdelivr.net/npm/@ffmpeg/ffmpeg@${FFMPEG_VERSION}/dist/esm`;
const FFMPEG_MODULE = `${FFMPEG_BASE}/index.js`;
const CORE_BASE = `https://cdn.jsdelivr.net/npm/@ffmpeg/core-mt@${CORE_VERSION}/dist/esm`;
const CORE_ASSETS = [
  { url: `${CORE_BASE}/ffmpeg-core.js`, type: "text/javascript" },
  { url: `${CORE_BASE}/ffmpeg-core.wasm`, type: "application/wasm" },
  { url: `${CORE_BASE}/ffmpeg-core.worker.js`, type: "text/javascript" },
];

let ffmpegInstance = null;
let loadingPromise = null;
let loadingVersion = 0;

async function toBlobURL(url, type) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Could not load FFmpeg asset (${response.status}): ${url}`);
  return URL.createObjectURL(new Blob([await response.arrayBuffer()], { type }));
}

async function toWorkerBlobURL(url, type) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Could not load FFmpeg worker (${response.status}): ${url}`);
  const source = await response.text();
  const rewritten = source.replace(/from\s+["']\.\/([^"']+)["']/g, (_match, filename) =>
    `from "${FFMPEG_BASE}/${filename}"`,
  );
  if (/from\s+["']\.\/[^"']+["']/.test(rewritten)) {
    throw new Error("The FFmpeg worker contains an unexpected relative import.");
  }
  return URL.createObjectURL(new Blob([rewritten], { type }));
}

function releaseBlobUrls(urls) {
  urls.forEach((url) => URL.revokeObjectURL(url));
}

export function getFFmpeg() {
  if (ffmpegInstance && ffmpegInstance.loaded) return Promise.resolve(ffmpegInstance);
  if (loadingPromise) return loadingPromise;

  const loadVersion = loadingVersion;
  const localBlobUrls = [];
  let loadingInstance = null;
  const promise = (async () => {
    if (!("Worker" in globalThis) || !("WebAssembly" in globalThis)) {
      throw new Error("This browser does not support Web Workers and WebAssembly required for local conversion.");
    }
    if (!globalThis.crossOriginIsolated || typeof SharedArrayBuffer === "undefined") {
      throw new Error(
        "This browser session is not cross-origin isolated. Enable service workers and reload the page to use the multithreaded HDR10 encoder.",
      );
    }

    const [{ FFmpeg }, ...assetUrls] = await Promise.all([
      import(FFMPEG_MODULE),
      ...CORE_ASSETS.map(async (asset) => {
        const url = await toBlobURL(asset.url, asset.type);
        localBlobUrls.push(url);
        return url;
      }),
    ]);
    if (loadVersion !== loadingVersion) throw new Error("FFmpeg loading was canceled.");
    const classWorkerURL = await toWorkerBlobURL(`${FFMPEG_BASE}/worker.js`, "text/javascript");
    localBlobUrls.push(classWorkerURL);
    if (loadVersion !== loadingVersion) throw new Error("FFmpeg loading was canceled.");

    const ffmpeg = new FFmpeg();
    loadingInstance = ffmpeg;
    ffmpeg.on("log", ({ message }) => {
      if (message) document.dispatchEvent(new CustomEvent("ffmpeg-log", { detail: message }));
    });
    ffmpegInstance = ffmpeg;
    await ffmpeg.load({
      classWorkerURL,
      coreURL: assetUrls[0],
      wasmURL: assetUrls[1],
      workerURL: assetUrls[2],
    });
    releaseBlobUrls(localBlobUrls);
    return ffmpeg;
  })().catch((error) => {
    if (ffmpegInstance === loadingInstance) {
      ffmpegInstance.terminate();
      ffmpegInstance = null;
    }
    releaseBlobUrls(localBlobUrls);
    throw new Error(`FFmpeg failed to load. Check your connection and browser support, then try again. ${error.message}`);
  });
  loadingPromise = promise;
  return promise.finally(() => {
    if (loadingPromise === promise) loadingPromise = null;
  });
}

export function terminateFFmpeg() {
  loadingVersion += 1;
  if (ffmpegInstance) {
    ffmpegInstance.terminate();
    ffmpegInstance = null;
  }
  loadingPromise = null;
}
