import { getNumberLocale, t } from "./i18n.js";

export function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes < 0) return t("common.unknownSize");
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes;
  let unitIndex = -1;
  do {
    value /= 1024;
    unitIndex += 1;
  } while (value >= 1024 && unitIndex < units.length - 1);
  const formatted = new Intl.NumberFormat(getNumberLocale(), {
    maximumFractionDigits: value >= 100 ? 0 : 1,
  }).format(value);
  return `${formatted} ${units[unitIndex]}`;
}

export function formatDuration(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return t("common.unknown");
  const total = Math.floor(seconds);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const remainder = total % 60;
  return hours
    ? `${hours}:${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`
    : `${minutes}:${String(remainder).padStart(2, "0")}`;
}

export function formatBitrate(bitsPerSecond) {
  if (!Number.isFinite(bitsPerSecond) || bitsPerSecond <= 0) return t("common.unknown");
  const bitrate = new Intl.NumberFormat(getNumberLocale(), {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(bitsPerSecond / 1_000_000);
  return `${bitrate} Mbps`;
}

export function safeOutputBaseName(filename) {
  const withoutExtension = filename.replace(/\.[^.]+$/, "");
  const safe = withoutExtension
    .normalize("NFKC")
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_")
    .replace(/[. ]+$/g, "")
    .trim()
    .slice(0, 120);
  return safe || "video";
}

export function parseFrameRate(value) {
  if (typeof value !== "string" || !value || value === "0/0") return null;
  const [numerator, denominator] = value.split("/").map(Number);
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator === 0) return null;
  const rate = numerator / denominator;
  return Number.isFinite(rate) && rate > 0 ? rate : null;
}

export function formatFps(rate) {
  if (!Number.isFinite(rate) || rate <= 0) return t("common.unknown");
  return `${new Intl.NumberFormat(getNumberLocale(), { maximumFractionDigits: 3 }).format(rate)} fps`;
}

export function isSupportedVideoFile(file) {
  if (!file || file.size <= 0) return false;
  const supportedExtension = /\.(mp4|mkv|mov|webm|avi|m4v|mpeg|mpg|ts|m2ts|3gp)$/i.test(file.name);
  return file.type.startsWith("video/") || supportedExtension;
}
