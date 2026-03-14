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
  "application/vnd.ms-word.document.macroenabled.12",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel.sheet.macroenabled.12",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.ms-powerpoint.presentation.macroenabled.12",
  "application/vnd.oasis.opendocument.text",
  "application/vnd.oasis.opendocument.spreadsheet",
  "application/vnd.oasis.opendocument.presentation",
]);

const ARCHIVE_MIME_MARKERS = ["zip", "x-7z", "rar", "tar", "gzip", "x-gzip", "x-tar", "bzip", "xz"];
const STRUCTURED_TEXT_MARKERS = ["json", "xml", "yaml", "yml", "toml", "ini"];

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
  if (STRUCTURED_TEXT_MARKERS.some((marker) => normalized.includes(marker))) return "📝";
  return "📎";
}
