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
  if (contentType.startsWith("image/")) return "🖼️";
  if (contentType === "application/pdf") return "📄";
  if (contentType.includes("zip")) return "🗜️";
  if (contentType.startsWith("text/")) return "📝";
  return "📎";
}
