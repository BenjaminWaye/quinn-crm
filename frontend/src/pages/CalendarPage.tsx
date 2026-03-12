import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { listOpenClawSchedules, listProducts, updateOpenClawScheduleProduct, type OpenClawScheduleJob, type OpenClawScheduleSlot, type ProductRecord } from "../lib/data";
import { formatDateTime } from "../lib/time";

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

type SlotItem = {
  id: string;
  name: string;
  time: string;
  agentId: string;
  color?: string;
};

function colorClasses(color?: string) {
  switch (color) {
    case "amber":
      return "border-amber-500/50 bg-amber-500/20 text-amber-300";
    case "red":
      return "border-red-500/50 bg-red-500/20 text-red-300";
    case "green":
      return "border-emerald-500/50 bg-emerald-500/20 text-emerald-300";
    case "blue":
      return "border-blue-500/50 bg-blue-500/20 text-blue-300";
    case "indigo":
      return "border-indigo-500/50 bg-indigo-500/20 text-indigo-300";
    case "purple":
      return "border-purple-500/50 bg-purple-500/20 text-purple-300";
    default:
      return "border-neutral-500/40 bg-neutral-700/30 text-neutral-200";
  }
}

function normalizeSlots(job: OpenClawScheduleJob): OpenClawScheduleSlot[] {
  return Array.isArray(job.weekSlots) ? job.weekSlots : [];
}

export function CalendarPage() {
  const { productId } = useParams();
  const [jobs, setJobs] = useState<OpenClawScheduleJob[]>([]);
  const [products, setProducts] = useState<ProductRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const run = async () => {
      try {
        setLoading(true);
        setError("");
        const [nextJobs, nextProducts] = await Promise.all([listOpenClawSchedules(), listProducts()]);
        setJobs(nextJobs);
        setProducts(nextProducts);
      } catch (nextError) {
        setError((nextError as Error)?.message || "Failed to load schedules");
      } finally {
        setLoading(false);
      }
    };
    void run();
  }, []);

  const scopedJobs = useMemo(() => {
    if (!productId) return jobs;
    return jobs.filter((job) => job.productId === productId);
  }, [jobs, productId]);

  const assignProduct = async (job: OpenClawScheduleJob, nextProductId: string) => {
    try {
      await updateOpenClawScheduleProduct(job, nextProductId || null);
      setJobs((prev) => prev.map((item) => (item.id === job.id && item.agentId === job.agentId ? { ...item, productId: nextProductId || null } : item)));
    } catch (e) {
      setError((e as Error)?.message || "Failed to update schedule product assignment");
    }
  };

  const alwaysRunning = useMemo(() => scopedJobs.filter((job) => job.alwaysRunning && job.enabled), [scopedJobs]);
  const columns = useMemo(() => {
    const byDay: Record<number, SlotItem[]> = { 0: [], 1: [], 2: [], 3: [], 4: [], 5: [], 6: [] };
    for (const job of scopedJobs) {
      if (!job.enabled) continue;
      for (const slot of normalizeSlots(job)) {
        if (slot.day < 0 || slot.day > 6) continue;
        byDay[slot.day].push({
          id: `${job.id}:${slot.day}:${slot.time}`,
          name: slot.label || job.name,
          time: slot.time,
          agentId: job.agentId,
          color: job.color,
        });
      }
    }
    for (const day of Object.keys(byDay)) {
      byDay[Number(day)].sort((a, b) => a.time.localeCompare(b.time));
    }
    return byDay;
  }, [scopedJobs]);

  const lastSyncedAt = scopedJobs
    .map((job) => job.syncedAt)
    .filter(Boolean)
    .sort((a, b) => String(b).localeCompare(String(a)))[0];

  return (
    <div className="p-4 lg:p-6 space-y-4 max-w-[1600px] mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Scheduled Tasks</h1>
          <p className="text-sm text-neutral-400">
            {productId
              ? `OpenClaw cron jobs for product: ${productId}`
              : "OpenClaw local cron/automation mirror"}
          </p>
        </div>
        <div className="text-xs text-neutral-400 flex items-center gap-3">
          <span>Last sync: {formatDateTime(lastSyncedAt)}</span>
          {productId && (
            <Link to="/calendar" className="px-2 py-1 rounded border border-[#2a3345] hover:bg-[#161c27]">
              View all products
            </Link>
          )}
        </div>
      </div>

      <section className="bg-[#0f141f] border border-[#232b3a] rounded-lg p-4">
        <h2 className="font-semibold text-neutral-100 mb-3">Always running</h2>
        <div className="flex gap-2 flex-wrap">
          {alwaysRunning.map((job) => (
            <span key={job.id} className={`px-3 py-1.5 rounded-md border text-sm ${colorClasses(job.color)}`}>
              {job.name}
            </span>
          ))}
          {!loading && alwaysRunning.length === 0 && (
            <span className="text-sm text-neutral-400">
              {productId ? "No always-running jobs for this product" : "No always-running jobs"}
            </span>
          )}
        </div>
      </section>

      <section className="bg-[#0f141f] border border-[#232b3a] rounded-lg p-4">
        <h2 className="font-semibold text-neutral-100 mb-3">Schedule product assignment</h2>
        <div className="space-y-2">
          {scopedJobs.map((job) => (
            <div key={`${job.agentId}:${job.id}`} className="flex flex-wrap items-center justify-between gap-3 rounded border border-[#2a3345] p-2.5">
              <div className="text-sm">
                <p className="font-medium text-neutral-100">{job.name}</p>
                <p className="text-xs text-neutral-400">{job.id} • {job.agentId}</p>
              </div>
              <label className="text-xs text-neutral-300 flex items-center gap-2">
                Product
                <select
                  value={job.productId ?? ""}
                  onChange={(e) => void assignProduct(job, e.target.value)}
                  className="bg-[#0b0f17] border border-[#2a3345] rounded px-2 py-1 text-sm text-neutral-100"
                >
                  <option value="">(global)</option>
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </label>
            </div>
          ))}
          {!loading && scopedJobs.length === 0 && <p className="text-sm text-neutral-400">No schedules available</p>}
        </div>
      </section>

      {error && <p className="text-sm text-red-400">{error}</p>}

      <section className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-7 gap-3">
        {DAY_LABELS.map((dayLabel, day) => (
          <article key={dayLabel} className="bg-[#0f141f] border border-[#232b3a] rounded-lg min-h-[320px]">
            <header className="px-3 py-2 border-b border-[#232b3a] text-sm font-semibold text-neutral-200">
              {dayLabel}
            </header>
            <div className="p-2 space-y-2">
              {(columns[day] ?? []).map((item) => (
                <div key={item.id} className={`rounded-md border px-2.5 py-2 text-sm ${colorClasses(item.color)}`}>
                  <p className="font-medium leading-tight">{item.name}</p>
                  <p className="text-xs opacity-90 mt-0.5">{item.time} • {item.agentId}</p>
                </div>
              ))}
              {!loading && (columns[day] ?? []).length === 0 && <p className="text-xs text-neutral-500 px-1 py-2">No jobs</p>}
            </div>
          </article>
        ))}
      </section>
    </div>
  );
}
