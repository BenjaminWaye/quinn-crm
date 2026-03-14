import type { TaskAttachmentUpload } from "./data";

export async function fileToTaskAttachmentUpload(file: File): Promise<TaskAttachmentUpload> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });

  return {
    name: file.name,
    dataUrl,
    contentType: file.type || "application/octet-stream",
    sizeBytes: file.size,
  };
}

export function formatBytes(sizeBytes: number): string {
  if (!Number.isFinite(sizeBytes) || sizeBytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let size = sizeBytes;
  let index = 0;
  while (size >= 1024 && index < units.length - 1) {
    size /= 1024;
    index += 1;
  }
  return `${size.toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}

const OFFICE_DOC_MIME_TYPES = new Set([
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
]);

const ARCHIVE_MIME_MARKERS = ["zip", "x-7z", "rar", "tar", "gzip", "x-gzip", "x-tar"];

export function attachmentIconLabel(contentType: string): string {
  const normalized = String(contentType || "").toLowerCase();
  if (normalized.startsWith("image/")) return "🖼️";
  if (normalized.startsWith("video/")) return "🎬";
  if (normalized.startsWith("audio/")) return "🎵";
  if (normalized === "application/pdf") return "📄";
  if (normalized === "text/csv") return "📊";
  if (OFFICE_DOC_MIME_TYPES.has(normalized)) return "📊";
  if (ARCHIVE_MIME_MARKERS.some((marker) => normalized.includes(marker))) return "🗜️";
  if (normalized.startsWith("text/")) return "📝";
  if (normalized.includes("json") || normalized.includes("xml") || normalized.includes("yaml")) return "📝";
  return "📎";
}
