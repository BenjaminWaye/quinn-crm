import type { KpiEntryRecord, KpiRecord } from "../../lib/data";

export interface KpiSnapshot {
  latestValue: number | null;
  previous7dValue: number | null;
  current7dValue: number | null;
  delta7d: number | null;
  targetValue?: number | null;
  targetStatus: "on_track" | "at_risk" | "off_track" | "unknown";
}

function parseDate(date: string): number {
  return new Date(`${date}T00:00:00Z`).getTime();
}

function latestInWindow(entries: KpiEntryRecord[], start: number, end: number): number | null {
  for (const entry of entries) {
    const ts = parseDate(entry.date);
    if (ts >= start && ts < end) {
      return entry.value;
    }
  }
  return null;
}

export function calculateKpiSnapshot(kpi: KpiRecord, entries: KpiEntryRecord[]): KpiSnapshot {
  const sorted = [...entries].sort((a, b) => parseDate(b.date) - parseDate(a.date));
  const latestValue = sorted[0]?.value ?? null;

  const now = Date.now();
  const day = 24 * 60 * 60 * 1000;
  const currentStart = now - 7 * day;
  const previousStart = now - 14 * day;

  const current7dValue = latestInWindow(sorted, currentStart, now + day);
  const previous7dValue = latestInWindow(sorted, previousStart, currentStart);
  const delta7d =
    current7dValue === null || previous7dValue === null ? null : current7dValue - previous7dValue;

  const targetValue = kpi.targetValue ?? null;

  let targetStatus: KpiSnapshot["targetStatus"] = "unknown";
  if (latestValue !== null && targetValue !== null) {
    if (kpi.targetDirection === "up") {
      targetStatus = latestValue >= targetValue ? "on_track" : latestValue >= targetValue * 0.9 ? "at_risk" : "off_track";
    } else if (kpi.targetDirection === "down") {
      targetStatus = latestValue <= targetValue ? "on_track" : latestValue <= targetValue * 1.1 ? "at_risk" : "off_track";
    } else {
      const tolerance = Math.max(1, Math.abs(targetValue) * 0.1);
      const diff = Math.abs(latestValue - targetValue);
      targetStatus = diff <= tolerance ? "on_track" : diff <= tolerance * 1.5 ? "at_risk" : "off_track";
    }
  }

  return {
    latestValue,
    previous7dValue,
    current7dValue,
    delta7d,
    targetValue,
    targetStatus,
  };
}
