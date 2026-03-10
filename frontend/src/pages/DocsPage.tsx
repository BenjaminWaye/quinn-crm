import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { listOpenClawDocs, type OpenClawDoc } from "../lib/data";
import { formatDateTime } from "../lib/time";

export function DocsPage() {
  const [docs, setDocs] = useState<OpenClawDoc[]>([]);
  const [selectedId, setSelectedId] = useState<string>("");
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const run = async () => {
      try {
        setLoading(true);
        setError("");
        const items = await listOpenClawDocs();
        setDocs(items);
        if (items[0]) setSelectedId(items[0].id);
      } catch (nextError) {
        setError((nextError as Error)?.message || "Failed to load docs");
      } finally {
        setLoading(false);
      }
    };
    void run();
  }, []);

  const types = useMemo(() => {
    const set = new Set<string>();
    docs.forEach((doc) => set.add(doc.type || "unknown"));
    return Array.from(set).sort();
  }, [docs]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return docs.filter((doc) => {
      if (typeFilter !== "all" && (doc.type || "unknown") !== typeFilter) return false;
      if (!q) return true;
      const haystack = [doc.name, doc.summary ?? "", doc.content, ...(doc.tags ?? [])].join(" ").toLowerCase();
      return haystack.includes(q);
    });
  }, [docs, query, typeFilter]);

  const selected = filtered.find((doc) => doc.id === selectedId) ?? filtered[0] ?? null;

  return (
    <div className="p-4 lg:p-6 max-w-[1700px] mx-auto h-full">
      <div className="h-full grid grid-cols-1 xl:grid-cols-[380px_minmax(0,1fr)] gap-4">
        <section className="bg-[#0f141f] border border-[#232b3a] rounded-lg overflow-hidden flex flex-col min-h-[620px]">
          <div className="p-3 border-b border-[#232b3a] space-y-2">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search documents..."
              className="w-full border border-[#2a3345] bg-[#0d1118] rounded-md px-3 py-2 text-sm"
            />
            <div className="flex gap-1.5 flex-wrap">
              <button
                onClick={() => setTypeFilter("all")}
                className={`px-2.5 py-1 rounded text-xs border ${typeFilter === "all" ? "bg-[#4f46e5]/25 border-[#4f46e5]/50 text-white" : "border-[#2a3345] text-neutral-300"}`}
              >
                all
              </button>
              {types.map((type) => (
                <button
                  key={type}
                  onClick={() => setTypeFilter(type)}
                  className={`px-2.5 py-1 rounded text-xs border ${typeFilter === type ? "bg-[#4f46e5]/25 border-[#4f46e5]/50 text-white" : "border-[#2a3345] text-neutral-300"}`}
                >
                  {type}
                </button>
              ))}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            {filtered.map((doc) => (
              <button
                key={doc.id}
                onClick={() => setSelectedId(doc.id)}
                className={[
                  "w-full text-left rounded-md px-3 py-2 border transition-colors",
                  selected?.id === doc.id
                    ? "bg-[#171c27] border-[#3a4660] text-white"
                    : "bg-[#121722] border-[#222b3c] text-neutral-200 hover:bg-[#182031]",
                ].join(" ")}
              >
                <p className="font-medium truncate">{doc.name}</p>
                <p className="text-xs text-neutral-400 mt-0.5">
                  {(doc.wordCount ?? 0).toLocaleString()} words • {doc.type || "unknown"}
                </p>
                <p className="text-xs text-neutral-500 mt-0.5">Modified {formatDateTime(doc.modifiedAt)}</p>
              </button>
            ))}
            {!loading && filtered.length === 0 && <p className="text-sm text-neutral-500 p-3">No documents found.</p>}
          </div>
        </section>

        <section className="bg-[#0f141f] border border-[#232b3a] rounded-lg overflow-hidden min-h-[620px] flex flex-col">
          <header className="px-4 py-3 border-b border-[#232b3a]">
            <h1 className="text-xl font-semibold">{selected?.name ?? "Document"}</h1>
            <p className="text-xs text-neutral-400 mt-1">
              {selected?.type || "unknown"} • Modified {formatDateTime(selected?.modifiedAt)}
              {selected?.sourceFile ? ` • ${selected.sourceFile}` : ""}
            </p>
          </header>

          <div className="px-4 py-3 border-b border-[#232b3a]">
            <p className="text-xs uppercase tracking-wide text-neutral-500 font-semibold mb-2">Linked tasks</p>
            <div className="flex gap-2 flex-wrap">
              {(selected?.linkedTasks ?? []).map((task) => (
                <Link
                  key={`${task.productId}:${task.taskId}`}
                  to={`/products/${task.productId}/tasks/${task.taskId}`}
                  className="px-2.5 py-1 rounded border border-[#2a3345] text-xs text-neutral-200 hover:bg-[#161c27]"
                >
                  {task.title || `${task.productId}/${task.taskId}`}
                </Link>
              ))}
              {selected && (selected.linkedTasks ?? []).length === 0 && <span className="text-xs text-neutral-500">No linked tasks</span>}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-5 py-4">
            {error && <p className="text-sm text-red-400 mb-3">{error}</p>}
            {!selected ? (
              <p className="text-neutral-500">{loading ? "Loading..." : "No document selected."}</p>
            ) : (
              <pre className="whitespace-pre-wrap font-sans text-sm leading-7 text-neutral-200 bg-transparent border-0 p-0 m-0">
                {selected.content}
              </pre>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
