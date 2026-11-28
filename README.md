# HDR Patcher

A static, browser-based BT.709 SDR-to-10-bit HEVC Main 10 HDR10-compatible converter. FFmpeg.wasm performs the conversion locally; video and output bytes are never sent to a server. The site has no analytics or tracking scripts.

## Features

- Drag-and-drop or file-picker input, local preview, metadata analysis and decoder checks.
- Warns and blocks already-HDR, unsupported, or insufficiently tagged input by default; an explicit force-processing checkbox can override color metadata detection when the user knows the source is SDR.
- Adjustable 0–100 nominal HDR peak target, from 100 to 1000 nits. A setting of 0 still converts the pixels to BT.2020/PQ.
- `zscale` pixel conversion through a 16-bit linear-light intermediate, then 10-bit 4:2:0 HEVC Main 10 encoding with `libx265`.
- x265 quality encoding (`medium`, CRF 18); 4K sources are warned and automatically downscaled to a 1080p maximum while preserving aspect ratio and frame rate.
- Output verification checks the HEVC Main 10 profile, 10-bit pixel format, and BT.2020/PQ color signaling before enabling download.
- Real FFmpeg progress when available, cancel by terminating the worker, before/after wipe comparison and local Blob download.

## Technology

- HTML, CSS and native JavaScript modules; no frontend framework or application server.
- `@ffmpeg/ffmpeg` 0.12.15 and `@ffmpeg/core-mt` 0.12.10 from version-pinned jsDelivr URLs.
- WebAssembly, Web Workers and SharedArrayBuffer. A local service worker adds COOP/COEP response headers so the static GitHub Pages site can run the multithreaded core.

## Run locally

Serve the project directory over HTTP; ES modules and service workers do not work from `file://`. For example:

```sh
python -m http.server 8000
```

Open `http://localhost:8000` in a browser with service workers enabled. The site registers `coi-serviceworker.js` and reloads once to enable cross-origin isolation. If your local server or browser blocks service workers, the multithreaded encoder cannot start. The first run downloads pinned FFmpeg assets; browser caching may allow later use offline, but offline availability is not guaranteed.

## GitHub Pages deployment

No build command, backend, or GitHub Actions workflow is required. Push the project files with `index.html` at the repository root, then open **Settings → Pages** and choose **Deploy from a branch**, the `main` branch, and `/(root)`.

The app's service worker adds `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: require-corp` to same-origin responses, which GitHub Pages cannot configure directly. Keep relative asset paths so the worker scope also works under a repository subpath. First load may reload once; verify that `crossOriginIsolated` is true in the browser console before testing conversion. See [GITHUB_PAGES_DEPLOY.txt](./GITHUB_PAGES_DEPLOY.txt) for deployment checks.

The navigation GitHub links point to https://github.com/spiritwtf/hdrmethod.

## FFmpeg.wasm HDR pipeline

By default, the app accepts BT.709 SDR input only. The optional force-processing checkbox bypasses color metadata classification and explicitly interprets the input primaries, transfer and matrix as BT.709; it cannot bypass decoder, file-size or even-dimension requirements. Forcing actual HDR or other color formats can produce incorrect color and brightness. 4K-class sources are warned about and scaled to fit within 1920×1080 (or 1080×1920 for portrait video), preserving aspect ratio and frame rate. `zscale` linearizes the source at a 100-nit reference, converts to BT.2020/PQ, and writes `yuv420p10le`; the intensity control sets the nominal peak from 100 to 1000 nits. A 16-bit intermediate is used because float `lutrgb` processing exceeds the tested WASM core's memory/format limits. The filter worker count is limited to one for reliable zscale operation. x265 normally uses its automatic thread pool, but outputs at or above 180 megapixels per second use a two-thread pool and one frame thread, with decoding limited to one thread, to reduce peak memory. The MP4 output is tagged as BT.2020, SMPTE ST 2084, limited-range and `hvc1`, then checked with FFprobe.

This is a pixel conversion, not metadata-only tagging. It cannot restore detail absent from the source. Mastering-display and content-light metadata are not synthesized because they cannot be accurately inferred from an SDR file; output is therefore described as HDR10-compatible rather than claiming source mastering metadata.

## Formats and compatibility

The file picker highlights MP4, MKV, MOV and WEBM, but compatibility depends on demuxers and decoders in the pinned FFmpeg core. The app probes the file and attempts to decode a frame; filename extensions do not establish codec support. Inputs must be BT.709 SDR and have even dimensions for 4:2:0 output. 4K-class input is resized as described above; lower-resolution input is not resized. Browser preview support is separate from FFmpeg support.

Use a current desktop browser with WebAssembly threads, SharedArrayBuffer, service workers and cross-origin isolation enabled. The page must be served from HTTPS or localhost. This path does not require WebGPU or a browser HEVC encoder.

## Large videos, cancellation and memory

Input files are limited to 512 MiB. The multithreaded core uses a 1 GiB shared WebAssembly memory, and the decoded/filter/encoded data needs additional browser memory. Large or long clips may fail even below the file-size limit. Close memory-heavy tabs and use shorter clips if allocation fails. Cancel terminates the FFmpeg worker and clears its in-memory filesystem.

## Privacy

Input is mounted through FFmpeg WorkerFS when available; otherwise files up to 512 MiB are copied into browser memory. Output is created as a local Blob and downloaded through a Blob URL. User video and output bytes are never uploaded. The FFmpeg core and JavaScript are downloaded from jsDelivr. No analytics, ad trackers or cloud encoding APIs are included.

## Scope and limitations

- One conversion mode: BT.709 SDR to BT.2020/PQ HDR.
- Only the first video stream and audio streams are selected. MP4-compatible audio is copied; other audio codecs are automatically transcoded to AAC. Subtitles and auxiliary streams are not preserved.
- Conversion is lossy; bit-exact source preservation is not possible.
- GitHub Pages' multithread path depends on service-worker support and third-party CDN CORS availability.
- The app verifies 10-bit HEVC and BT.2020/PQ signaling, but does not invent mastering-display or content-light metadata.
