type FirestoreLikeTimestamp = {
  toDate?: () => Date;
  seconds?: number;
  nanoseconds?: number;
};

function toDate(value: unknown): Date | null {
  if (!value) {
    return null;
  }

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }

  if (typeof value === "string" || typeof value === "number") {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  if (typeof value === "object") {
    const ts = value as FirestoreLikeTimestamp;
    if (typeof ts.toDate === "function") {
      const parsed = ts.toDate();
      return Number.isNaN(parsed.getTime()) ? null : parsed;
    }
    if (typeof ts.seconds === "number") {
      const millis = ts.seconds * 1000 + Math.floor((ts.nanoseconds ?? 0) / 1_000_000);
      const parsed = new Date(millis);
      return Number.isNaN(parsed.getTime()) ? null : parsed;
    }
  }

  return null;
}

export function formatDateTime(value: unknown): string {
  const date = toDate(value);
  if (!date) {
    return "Unknown time";
  }

  return new Intl.DateTimeFormat("sv-SE", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}
