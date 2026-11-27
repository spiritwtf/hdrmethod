const WORKGROUP_SIZE = 8;
const READBACK_ALIGNMENT = 256;
const MAX_GPU_FRAME_BYTES = 128 * 1024 * 1024;
const HEVC_MAIN10_LEVELS = [
  { idc: 60, maxPictureSize: 122880, maxSamplesPerSecond: 3686400, maxBitrate: 1500000 },
  { idc: 63, maxPictureSize: 245760, maxSamplesPerSecond: 7372800, maxBitrate: 3000000 },
  { idc: 90, maxPictureSize: 552960, maxSamplesPerSecond: 16588800, maxBitrate: 6000000 },
  { idc: 93, maxPictureSize: 983040, maxSamplesPerSecond: 33177600, maxBitrate: 10000000 },
  { idc: 120, maxPictureSize: 2228224, maxSamplesPerSecond: 66846720, maxBitrate: 12000000 },
  { idc: 123, maxPictureSize: 2228224, maxSamplesPerSecond: 133693440, maxBitrate: 20000000 },
  { idc: 126, maxPictureSize: 2228224, maxSamplesPerSecond: 267386880, maxBitrate: 30000000 },
  { idc: 150, maxPictureSize: 8912896, maxSamplesPerSecond: 267386880, maxBitrate: 25000000 },
  { idc: 153, maxPictureSize: 8912896, maxSamplesPerSecond: 534773760, maxBitrate: 40000000 },
  { idc: 156, maxPictureSize: 8912896, maxSamplesPerSecond: 1069547520, maxBitrate: 60000000 },
  { idc: 180, maxPictureSize: 35651584, maxSamplesPerSecond: 1069547520, maxBitrate: 60000000 },
  { idc: 183, maxPictureSize: 35651584, maxSamplesPerSecond: 2139095040, maxBitrate: 100000000 },
  { idc: 186, maxPictureSize: 35651584, maxSamplesPerSecond: 4278190080, maxBitrate: 160000000 },
];

const SHADER = `
struct Params {
  width: u32,
  height: u32,
  strength: f32,
  padding: u32,
}

@group(0) @binding(0) var sourceTexture: texture_2d<f32>;
@group(0) @binding(1) var outputTexture: texture_storage_2d<rgba16float, write>;
@group(0) @binding(2) var<uniform> params: Params;

fn bt709ToLinear(value: f32) -> f32 {
  if (value < 0.081) {
    return value / 4.5;
  }
  return pow((value + 0.099) / 1.099, 1.0 / 0.45);
}

fn linearToPq(value: f32) -> f32 {
  let m1 = 2610.0 / 16384.0;
  let m2 = 2523.0 / 32.0;
  let c1 = 3424.0 / 4096.0;
  let c2 = 2413.0 / 128.0;
  let c3 = 2392.0 / 128.0;
  let normalized = clamp(value / 10000.0, 0.0, 1.0);
  let powered = pow(normalized, m1);
  return pow((c1 + c2 * powered) / (1.0 + c3 * powered), m2);
}

@compute @workgroup_size(${WORKGROUP_SIZE}, ${WORKGROUP_SIZE})
fn main(@builtin(global_invocation_id) id: vec3<u32>) {
  if (id.x >= params.width || id.y >= params.height) {
    return;
  }

  let source = textureLoad(sourceTexture, vec2i(id.xy), 0).rgb;
  let linear709 = vec3f(
    bt709ToLinear(source.r),
    bt709ToLinear(source.g),
    bt709ToLinear(source.b)
  );
  let linear2020 = vec3f(
    0.6274040 * linear709.r + 0.3292820 * linear709.g + 0.0433136 * linear709.b,
    0.0690970 * linear709.r + 0.9195400 * linear709.g + 0.0113612 * linear709.b,
    0.0163916 * linear709.r + 0.0880133 * linear709.g + 0.8955950 * linear709.b
  );
  let peakScale = 1.0 + 1.5 * params.strength;
  let curveStrength = 0.2 * params.strength;
  let expanded = linear2020 * (vec3f(1.0) + curveStrength * (vec3f(1.0) - linear2020));
  let nits = clamp(expanded * (100.0 * peakScale), vec3f(0.0), vec3f(10000.0));
  let pq = vec3f(linearToPq(nits.r), linearToPq(nits.g), linearToPq(nits.b));
  textureStore(outputTexture, vec2i(id.xy), vec4f(pq, 1.0));
}
`;

function align(value, alignment) {
  return Math.ceil(value / alignment) * alignment;
}

function halfToFloat(value) {
  const sign = value & 0x8000 ? -1 : 1;
  const exponent = (value >> 10) & 0x1f;
  const fraction = value & 0x03ff;
  if (exponent === 0) return sign * (fraction / 1024) * 2 ** -14;
  if (exponent === 0x1f) return fraction ? NaN : sign * Infinity;
  return sign * (1 + fraction / 1024) * 2 ** (exponent - 15);
}

function clampCode(value, min, max) {
  return Math.max(min, Math.min(max, Math.round(value)));
}

function packI420P10(mapped, bytesPerRow, width, height) {
  const ySize = width * height;
  const chromaWidth = width / 2;
  const chromaHeight = height / 2;
  const chromaSize = chromaWidth * chromaHeight;
  const output = new Uint16Array(ySize + chromaSize * 2);
  const uOffset = ySize;
  const vOffset = ySize + chromaSize;
  const mappedWords = new Uint16Array(mapped.buffer, mapped.byteOffset, mapped.byteLength / 2);
  const mappedStride = bytesPerRow / 2;

  function readPixel(x, y) {
    const offset = y * mappedStride + x * 4;
    const red = halfToFloat(mappedWords[offset]);
    const green = halfToFloat(mappedWords[offset + 1]);
    const blue = halfToFloat(mappedWords[offset + 2]);
    const luma = 0.2627 * red + 0.6780 * green + 0.0593 * blue;
    const cb = (blue - luma) / (2 * (1 - 0.0593));
    const cr = (red - luma) / (2 * (1 - 0.2627));
    return { luma, cb, cr };
  }

  for (let y = 0; y < height; y += 2) {
    for (let x = 0; x < width; x += 2) {
      const topLeft = readPixel(x, y);
      const topRight = readPixel(x + 1, y);
      const bottomLeft = readPixel(x, y + 1);
      const bottomRight = readPixel(x + 1, y + 1);
      const lumaOffset = y * width + x;
      output[lumaOffset] = clampCode(64 + topLeft.luma * 876, 64, 940);
      output[lumaOffset + 1] = clampCode(64 + topRight.luma * 876, 64, 940);
      output[lumaOffset + width] = clampCode(64 + bottomLeft.luma * 876, 64, 940);
      output[lumaOffset + width + 1] = clampCode(64 + bottomRight.luma * 876, 64, 940);

      const chromaIndex = (y / 2) * chromaWidth + x / 2;
      const averageCb = (topLeft.cb + topRight.cb + bottomLeft.cb + bottomRight.cb) / 4;
      const averageCr = (topLeft.cr + topRight.cr + bottomLeft.cr + bottomRight.cr) / 4;
      output[uOffset + chromaIndex] = clampCode(512 + averageCb * 896, 64, 960);
      output[vOffset + chromaIndex] = clampCode(512 + averageCr * 896, 64, 960);
    }
  }

  return output;
}

function hevcMain10CodecString(width, height, bitrate, frameRate) {
  if (width % 2 !== 0 || height % 2 !== 0) {
    throw new Error("HEVC Main 10 4:2:0 output requires even video dimensions.");
  }
  const pictureSize = width * height;
  const sampleRate = pictureSize * (frameRate || 30);
  const level = HEVC_MAIN10_LEVELS.find((candidate) =>
    pictureSize <= candidate.maxPictureSize
    && sampleRate <= candidate.maxSamplesPerSecond
    && bitrate <= candidate.maxBitrate,
  );
  if (!level) {
    throw new Error("The source exceeds the supported HEVC Main 10 level limits.");
  }
  return `hvc1.2.4.L${level.idc}.B0`;
}

async function createGPUContext(width, height, bitrate, frameRate) {
  if (!("gpu" in navigator) || !("VideoEncoder" in globalThis) || !("VideoDecoder" in globalThis)) {
    throw new Error("WebGPU or WebCodecs is unavailable.");
  }

  const codecString = hevcMain10CodecString(width, height, bitrate, frameRate);
  const framerate = frameRate || 30;
  const adapter = await navigator.gpu.requestAdapter();
  if (!adapter) throw new Error("No compatible WebGPU adapter is available.");
  if (width > adapter.limits.maxTextureDimension2D || height > adapter.limits.maxTextureDimension2D) {
    throw new Error("The video dimensions exceed this GPU's texture limit.");
  }
  const readbackSize = align(width * 8, READBACK_ALIGNMENT) * height;
  if (readbackSize > Math.min(adapter.limits.maxBufferSize, MAX_GPU_FRAME_BYTES)) {
    throw new Error("The video frame exceeds this browser's safe 10-bit GPU memory limit.");
  }

  const encoderSupport = await VideoEncoder.isConfigSupported({
    codec: codecString,
    width,
    height,
    bitrate,
    framerate,
    hardwareAcceleration: "prefer-hardware",
  });
  if (!encoderSupport.supported || encoderSupport.config?.codec !== codecString) {
    throw new Error(
      "This browser does not provide an HEVC Main 10 encoder for this video size. No 8-bit or CPU fallback will be used.",
    );
  }

  const device = await adapter.requestDevice();
  const shaderModule = device.createShaderModule({ code: SHADER });
  const pipeline = device.createComputePipeline({
    layout: "auto",
    compute: { module: shaderModule, entryPoint: "main" },
  });
  return { device, pipeline, codecString };
}

export async function createHDRFrameProcessor({ width, height, intensity, device, pipeline }) {
  const strength = Math.min(1, Math.max(0, Number(intensity) / 100));
  const uniformBuffer = device.createBuffer({
    size: 16,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  const uniformValues = new ArrayBuffer(16);
  const uniformView = new DataView(uniformValues);
  uniformView.setUint32(0, width, true);
  uniformView.setUint32(4, height, true);
  uniformView.setFloat32(8, strength, true);
  uniformView.setUint32(12, 0, true);
  device.queue.writeBuffer(uniformBuffer, 0, uniformValues);

  return async function processFrame(sample) {
    const sampleWidth = sample.codedWidth;
    const sampleHeight = sample.codedHeight;
    if (sampleWidth !== width || sampleHeight !== height) {
      throw new Error("The source video changes frame dimensions; GPU processing is not safe for this file.");
    }

    const sourceBytes = new Uint8Array(sample.allocationSize({ format: "RGBA" }));
    const sourcePlanes = await sample.copyTo(sourceBytes, { format: "RGBA" });
    const sourcePlane = sourcePlanes[0];
    const sourceStride = sourcePlane.stride || width * 4;
    const tightSource = new Uint8Array(width * height * 4);
    for (let row = 0; row < height; row += 1) {
      const sourceOffset = sourcePlane.offset + row * sourceStride;
      tightSource.set(sourceBytes.subarray(sourceOffset, sourceOffset + width * 4), row * width * 4);
    }

    const sourceTexture = device.createTexture({
      size: { width, height },
      format: "rgba8unorm",
      usage: GPUTextureUsage.COPY_DST | GPUTextureUsage.TEXTURE_BINDING,
    });
    const outputTexture = device.createTexture({
      size: { width, height },
      format: "rgba16float",
      usage: GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.COPY_SRC,
    });
    const bytesPerRow = align(width * 8, READBACK_ALIGNMENT);
    const readbackBuffer = device.createBuffer({
      size: bytesPerRow * height,
      usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
    });

    try {
      device.queue.writeTexture(
        { texture: sourceTexture },
        tightSource,
        { bytesPerRow: width * 4, rowsPerImage: height },
        { width, height, depthOrArrayLayers: 1 },
      );
      const bindGroup = device.createBindGroup({
        layout: pipeline.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: sourceTexture.createView() },
          { binding: 1, resource: outputTexture.createView() },
          { binding: 2, resource: { buffer: uniformBuffer } },
        ],
      });
      const encoder = device.createCommandEncoder();
      const pass = encoder.beginComputePass();
      pass.setPipeline(pipeline);
      pass.setBindGroup(0, bindGroup);
      pass.dispatchWorkgroups(
        Math.ceil(width / WORKGROUP_SIZE),
        Math.ceil(height / WORKGROUP_SIZE),
      );
      pass.end();
      encoder.copyTextureToBuffer(
        { texture: outputTexture },
        { buffer: readbackBuffer, bytesPerRow, rowsPerImage: height },
        { width, height, depthOrArrayLayers: 1 },
      );
      device.queue.submit([encoder.finish()]);
      await readbackBuffer.mapAsync(GPUMapMode.READ);
      const mapped = new Uint8Array(readbackBuffer.getMappedRange());
      const outputBytes = packI420P10(mapped, bytesPerRow, width, height);

      return new VideoFrame(outputBytes, {
        format: "I420P10",
        codedWidth: width,
        codedHeight: height,
        timestamp: Math.round(sample.timestamp * 1_000_000),
        duration: Math.round(sample.duration * 1_000_000),
        colorSpace: {
          primaries: "bt2020",
          transfer: "smpte2084",
          matrix: "bt2020-ncl",
          fullRange: false,
        },
      });
    } finally {
      if (readbackBuffer.mapState === "mapped") readbackBuffer.unmap();
      readbackBuffer.destroy();
      outputTexture.destroy();
      sourceTexture.destroy();
    }
  };
}

export async function createGPUHDRPipeline({ width, height, bitrate, frameRate, intensity }) {
  const context = await createGPUContext(width, height, bitrate, frameRate);
  try {
    const processFrame = await createHDRFrameProcessor({ ...context, width, height, intensity });
    return {
      device: context.device,
      codecString: context.codecString,
      processFrame,
      dispose() {
        context.device.destroy();
      },
    };
  } catch (error) {
    context.device.destroy();
    throw error;
  }
}
