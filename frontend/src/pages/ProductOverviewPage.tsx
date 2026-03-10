import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { getProduct, listActivity, listBlockedTasks, listKeyContacts, listKpiEntries, listKpis, listTopPriorities, type ActivityRecord, type ContactRecord, type KpiRecord, type ProductRecord, type TaskRecord } from "../lib/data";
import { calculateKpiSnapshot } from "../features/kpi/kpi.calculations";
import { formatDateTime } from "../lib/time";

export function ProductOverviewPage() {
  const { productId = "" } = useParams();
  const [product, setProduct] = useState<ProductRecord | null>(null);
  const [kpis, setKpis] = useState<KpiRecord[]>([]);
  const [snapshots, setSnapshots] = useState<Record<string, ReturnType<typeof calculateKpiSnapshot>>>({});
  const [top, setTop] = useState<TaskRecord[]>([]);
  const [contacts, setContacts] = useState<ContactRecord[]>([]);
  const [activity, setActivity] = useState<ActivityRecord[]>([]);
  const [blockers, setBlockers] = useState<TaskRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const load = async () => {
      if (!productId) return;
      try {
        setLoading(true);
        setError("");
        const [nextProduct, nextKpis, nextTop, nextContacts, nextActivity, nextBlockers] = await Promise.all([
          getProduct(productId),
          listKpis(productId),
          listTopPriorities(productId),
          listKeyContacts(productId),
          listActivity(productId),
          listBlockedTasks(productId),
        ]);
        const map: Record<string, ReturnType<typeof calculateKpiSnapshot>> = {};
        for (const kpi of nextKpis.slice(0, 6)) {
          map[kpi.key] = calculateKpiSnapshot(kpi, await listKpiEntries(productId, kpi.key));
        }
        setProduct(nextProduct);
        setKpis(nextKpis.slice(0, 6));
        setSnapshots(map);
        setTop(nextTop.slice(0, 5));
        setContacts(nextContacts.slice(0, 5));
        setActivity(nextActivity.slice(0, 10));
        setBlockers(nextBlockers.slice(0, 10));
      } catch (nextError) {
        setError((nextError as Error)?.message || "Failed to load overview");
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, [productId]);

  return (
    <div className="p-4 lg:p-8 pb-20 lg:pb-8 max-w-7xl mx-auto space-y-6">
      {error && <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 text-sm">{error}</div>}
      <section className="bg-white border border-neutral-200 rounded-lg p-4 space-y-2">
        <h1 className="text-2xl font-bold">{product?.name ?? "Product overview"}</h1>
        <p className="text-sm text-neutral-700">{product?.description?.trim() || "No description yet."}</p>
        <p className="text-sm text-neutral-700">
          <span className="font-medium">Mission:</span> {product?.mission?.trim() || "No mission set."}
        </p>
        <p className="text-sm text-neutral-700">
          <span className="font-medium">Repo:</span>{" "}
          {product?.repo?.trim() ? (
            <a className="text-blue-600 hover:underline break-all" href={product.repo} target="_blank" rel="noreferrer">
              {product.repo}
            </a>
          ) : (
            "No repo linked."
          )}
        </p>
      </section>
      {blockers.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <h3 className="font-semibold text-red-800 mb-2">Blocked tasks</h3>
          {blockers.map((task) => <p key={task.id} className="text-sm text-red-700">{task.title}</p>)}
        </div>
      )}

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">KPI Snapshot</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {kpis.map((kpi) => (
            <div key={kpi.key} className="bg-white border border-neutral-200 rounded-lg p-4 space-y-1">
              <p className="text-sm text-neutral-600">{kpi.name}</p>
              <p className="text-2xl font-bold">{snapshots[kpi.key]?.latestValue ?? "-"}</p>
              <p className="text-xs text-neutral-500">target {snapshots[kpi.key]?.targetValue ?? "-"}</p>
              <p className="text-xs text-neutral-500">7d {snapshots[kpi.key]?.delta7d ?? "-"}</p>
            </div>
          ))}
          {!loading && kpis.length === 0 && <p className="text-sm text-neutral-500">No KPI definitions yet for this product.</p>}
        </div>
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <section className="bg-white border border-neutral-200 rounded-lg">
          <div className="p-4 border-b border-neutral-100 font-semibold">Top priority tasks</div>
          {top.map((task, index) => (
            <Link key={task.id ?? `${task.title}-${index}`} to={`/products/${productId}/tasks/${task.id}`} className="flex justify-between p-4 border-t border-neutral-100 hover:bg-neutral-50">
              <span>{task.title}</span><span className="text-xs capitalize text-neutral-600">{task.priority}</span>
            </Link>
          ))}
          {!loading && top.length === 0 && <p className="p-4 text-sm text-neutral-500">No open tasks yet.</p>}
        </section>

        <section className="bg-white border border-neutral-200 rounded-lg">
          <div className="p-4 border-b border-neutral-100 font-semibold">Key contacts</div>
          {contacts.map((contact, index) => (
            <Link key={contact.id ?? `${contact.name}-${index}`} to={`/products/${productId}/crm/${contact.id}`} className="flex justify-between p-4 border-t border-neutral-100 hover:bg-neutral-50">
              <span>{contact.name}</span><span className="text-xs capitalize text-neutral-600">{contact.status}</span>
            </Link>
          ))}
          {!loading && contacts.length === 0 && <p className="p-4 text-sm text-neutral-500">No contacts yet.</p>}
        </section>
      </div>

      <section className="bg-white border border-neutral-200 rounded-lg">
        <div className="p-4 border-b border-neutral-100 font-semibold">Recent activity</div>
        {activity.map((item, index) => (
          <div key={item.id ?? `${String(item.createdAt ?? "unknown")}-${item.message}-${index}`} className="p-4 border-t border-neutral-100">
            <p className="text-sm">{item.message}</p>
            <p className="text-xs text-neutral-500 mt-1">{formatDateTime(item.createdAt)}</p>
          </div>
        ))}
        {!loading && activity.length === 0 && <p className="p-4 text-sm text-neutral-500">No recent activity yet.</p>}
      </section>
    </div>
  );
}
