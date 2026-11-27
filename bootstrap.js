function withTimeout(promise, milliseconds) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error("Timed out while enabling cross-origin isolation.")), milliseconds);
    }),
  ]).finally(() => clearTimeout(timer));
}

async function enableCrossOriginIsolation() {
  if (globalThis.crossOriginIsolated) {
    sessionStorage.removeItem("hdr-patcher-coi-reload");
    return;
  }
  if (!("serviceWorker" in navigator)) return;

  const reloadKey = "hdr-patcher-coi-reload";
  try {
    await withTimeout(
      navigator.serviceWorker.register(new URL("../coi-serviceworker.js", import.meta.url), {
        scope: new URL("../", import.meta.url).pathname,
      }),
      10000,
    );
    await withTimeout(navigator.serviceWorker.ready, 10000);
    if (!globalThis.crossOriginIsolated && sessionStorage.getItem(reloadKey) !== "done") {
      sessionStorage.setItem(reloadKey, "done");
      location.reload();
    }
  } catch (error) {
    console.error("Could not enable cross-origin isolation for the multithreaded FFmpeg core.", error);
  }
}

import("./app.js").catch((error) => {
  console.error("The application could not start.", error);
});

enableCrossOriginIsolation().catch((error) => {
  console.error("Cross-origin isolation setup failed.", error);
});
