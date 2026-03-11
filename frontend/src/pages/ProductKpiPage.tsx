import { useEffect, useState, type FormEvent } from "react";
import { useParams } from "react-router-dom";
import { addKpiEntry, createKpi, listKpiEntries, listKpis, type KpiEntryRecord, type KpiRecord } from "../lib/data";

export function ProductKpiPage() {
  const { productId = "" } = useParams();
  const [kpis, setKpis] = useState<KpiRecord[]>([]);
  const [entries, setEntries] = useState<KpiEntryRecord[]>([]);
  const [selectedKpi, setSelectedKpi] = useState("");
  const [value, setValue] = useState("0");
  const [busy, setBusy] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const [createError, setCreateError] = useState("");
  const [kpiName, setKpiName] = useState("");
  const [kpiKey, setKpiKey] = useState("");
  const [targetValue, setTargetValue] = useState("");
  const [unit, setUnit] = useState<"number" | "percent" | "currency" | "text">("number");
  const [targetDirection, setTargetDirection] = useState<"up" | "down" | "flat">("up");

  const kpiNameByKey = Object.fromEntries(kpis.map((kpi) => [kpi.key, kpi.name]));

  const load = async () => {
    if (!productId) return;
    const nextKpis = await listKpis(productId);
    setKpis(nextKpis);
    const key = selectedKpi || nextKpis[0]?.key || "";
    setSelectedKpi(key);
    if (key) setEntries(await listKpiEntries(productId, key));
  };

  useEffect(() => { void load(); }, [productId]);

  useEffect(() => {
    const loadEntries = async () => {
      if (!productId || !selectedKpi) return;
      setEntries(await listKpiEntries(productId, selectedKpi));
    };
    void loadEntries();
  }, [productId, selectedKpi]);

  const onAdd = async (event?: FormEvent) => {
    event?.preventDefault();
    if (!productId || !selectedKpi || busy) return;
    try {
      setBusy(true);
      setError("");
      await addKpiEntry({ productId, kpiKey: selectedKpi, value: Number(value), date: new Date().toISOString().slice(0, 10) });
      await load();
    } catch (nextError) {
      setError((nextError as Error)?.message || "Failed to add KPI entry");
      console.error("Failed to add KPI entry", nextError);
    } finally {
      setBusy(false);
    }
  };

  const onCreateKpi = async (event?: FormEvent) => {
    event?.preventDefault();
    if (!productId || !kpiName.trim() || !kpiKey.trim() || creating) return;
    try {
      setCreating(true);
      setCreateError("");
      await createKpi({
        productId,
        name: kpiName.trim(),
        key: kpiKey.trim().toLowerCase().replace(/[^a-z0-9_]+/g, "_"),
        unit,
        targetDirection,
        targetValue: targetValue.trim() === "" ? null : Number(targetValue),
      });
      setKpiName("");
      setKpiKey("");
      setTargetValue("");
      await load();
    } catch (nextError) {
      setCreateError((nextError as Error)?.message || "Failed to create KPI");
      console.error("Failed to create KPI", nextError);
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="p-4 lg:p-8 pb-20 lg:pb-8 max-w-6xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold">KPI Dashboard</h1>

      <div className="bg-white border border-neutral-200 rounded-lg p-4 space-y-3">
        <h3 className="font-semibold">Create KPI definition</h3>
        <form className="grid grid-cols-1 md:grid-cols-5 gap-2" onSubmit={(event) => void onCreateKpi(event)}>
          <input className="border border-neutral-300 rounded-lg px-3 py-2" placeholder="Name (e.g. Weekly installs)" value={kpiName} onChange={(e) => setKpiName(e.target.value)} />
          <input className="border border-neutral-300 rounded-lg px-3 py-2" placeholder="Key (e.g. weekly_installs)" value={kpiKey} onChange={(e) => setKpiKey(e.target.value)} />
          <select className="border border-neutral-300 rounded-lg px-3 py-2" value={unit} onChange={(e) => setUnit(e.target.value as "number" | "percent" | "currency" | "text")}>
            <option value="number">number</option>
            <option value="percent">percent</option>
            <option value="currency">currency</option>
            <option value="text">text</option>
          </select>
          <select className="border border-neutral-300 rounded-lg px-3 py-2" value={targetDirection} onChange={(e) => setTargetDirection(e.target.value as "up" | "down" | "flat")}>
            <option value="up">up</option>
            <option value="down">down</option>
            <option value="flat">flat</option>
          </select>
          <input className="border border-neutral-300 rounded-lg px-3 py-2" placeholder="Target value (optional)" value={targetValue} onChange={(e) => setTargetValue(e.target.value)} />
          <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded-lg disabled:opacity-60 md:col-span-5 md:justify-self-start" disabled={creating || !kpiName.trim() || !kpiKey.trim()}>
            {creating ? "Creating..." : "Create KPI"}
          </button>
        </form>
        {createError && <p className="text-sm text-red-600">{createError}</p>}
      </div>

      <div className="bg-white border border-neutral-200 rounded-lg p-4 space-y-3">
        <h3 className="font-semibold">Add KPI entry</h3>
        <form className="flex gap-2 flex-wrap" onSubmit={(event) => void onAdd(event)}>
          <select className="border border-neutral-300 rounded-lg px-3 py-2" value={selectedKpi} onChange={(e) => setSelectedKpi(e.target.value)} disabled={kpis.length === 0}>
            {kpis.length === 0 && <option value="">No KPI definitions yet</option>}
            {kpis.map((kpi) => <option key={kpi.key} value={kpi.key}>{kpi.name}</option>)}
          </select>
          <input className="border border-neutral-300 rounded-lg px-3 py-2" value={value} onChange={(e) => setValue(e.target.value)} />
          <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded-lg disabled:opacity-60" disabled={busy || !selectedKpi}>
            {busy ? "Adding..." : "Add"}
          </button>
        </form>
        {kpis.length === 0 && <p className="text-sm text-neutral-500">Create a KPI definition first, then add entries.</p>}
        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {kpis.map((kpi) => (
          <div key={kpi.key} className="bg-white border border-neutral-200 rounded-lg p-4">
            <p className="font-semibold">{kpi.name}</p>
            <p className="text-sm text-neutral-600">target: {kpi.targetValue ?? "-"}</p>
          </div>
        ))}
      </div>

      <div className="bg-white border border-neutral-200 rounded-lg">
        <div className="p-4 border-b border-neutral-100 font-semibold">Recent entries</div>
        {entries.map((entry) => (
          <div key={entry.id} className="p-4 border-t border-neutral-100 flex justify-between">
            <div>
              <p className="text-sm font-medium">{kpiNameByKey[entry.kpiKey] ?? entry.kpiKey}</p>
              <p className="text-xs text-neutral-500">{entry.date}</p>
            </div>
            <strong>{entry.value}</strong>
          </div>
        ))}
        {entries.length === 0 && <p className="p-4 text-sm text-neutral-500">No KPI entries yet.</p>}
      </div>
    </div>
  );
}
