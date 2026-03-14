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

export function attachmentIconLabel(contentType: string): string {
  const normalized = String(contentType || "").trim().toLowerCase();

  if (normalized.startsWith("image/")) return "🖼️";
  if (normalized.startsWith("video/")) return "🎬";
  if (normalized.startsWith("audio/")) return "🎵";

  if (normalized === "application/pdf") return "📄";

  if (
    normalized === "text/csv"
    || normalized.includes("spreadsheet")
    || normalized.includes("excel")
  ) {
    return "📊";
  }

  if (
    normalized === "application/json"
    || normalized.endsWith("+json")
  ) {
    return "🧾";
  }

  if (
    normalized.includes("word")
    || normalized.includes("officedocument.wordprocessingml")
  ) {
    return "📘";
  }

  if (
    normalized.includes("presentation")
    || normalized.includes("powerpoint")
  ) {
    return "📽️";
  }

  if (normalized.includes("zip") || normalized.includes("compressed")) return "🗜️";
  if (normalized.startsWith("text/")) return "📝";
  return "📎";
}
