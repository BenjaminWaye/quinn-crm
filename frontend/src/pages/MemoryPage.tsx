import { useEffect, useMemo, useState } from "react";
import {
  getOpenClawLongTermMemory,
  listOpenClawMemoryEntries,
  type OpenClawLongTermMemory,
  type OpenClawMemoryEntry,
} from "../lib/data";
import { formatDateTime } from "../lib/time";

type SelectedItem =
  | { type: "long_term"; item: OpenClawLongTermMemory }
  | { type: "entry"; item: OpenClawMemoryEntry };

function countWords(content: string): number {
  return content.trim().split(/\s+/).filter(Boolean).length;
}

export function MemoryPage() {
  const [query, setQuery] = useState("");
  const [entries, setEntries] = useState<OpenClawMemoryEntry[]>([]);
  const [longTerm, setLongTerm] = useState<OpenClawLongTermMemory | null>(null);
  const [selected, setSelected] = useState<SelectedItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const run = async () => {
      try {
        setLoading(true);
        setError("");
        const [nextEntries, nextLongTerm] = await Promise.all([
          listOpenClawMemoryEntries(),
          getOpenClawLongTermMemory(),
        ]);
        setEntries(nextEntries);
        setLongTerm(nextLongTerm);
        if (nextLongTerm) {
          setSelected({ type: "long_term", item: nextLongTerm });
        } else if (nextEntries[0]) {
          setSelected({ type: "entry", item: nextEntries[0] });
        }
      } catch (nextError) {
        setError((nextError as Error)?.message || "Failed to load memory");
      } finally {
        setLoading(false);
      }
    };
    void run();
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return entries;
    return entries.filter((entry) => {
      const haystack = [entry.title, entry.summary ?? "", entry.content, ...(entry.tags ?? [])].join(" ").toLowerCase();
      return haystack.includes(q);
    });
  }, [entries, query]);

  return (
    <div className="p-4 lg:p-6 max-w-[1700px] mx-auto h-full">
      <div className="mb-3 text-xs text-neutral-400">
        Company-wide memory index synced from OpenClaw (not scoped to a single product).
      </div>
      <div className="h-full grid grid-cols-1 xl:grid-cols-[360px_minmax(0,1fr)] gap-4">
        <section className="bg-[#0f141f] border border-[#232b3a] rounded-lg overflow-hidden flex flex-col min-h-[600px]">
          <div className="p-3 border-b border-[#232b3a]">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search memory..."
              className="w-full border border-[#2a3345] bg-[#0d1118] rounded-md px-3 py-2 text-sm"
            />
          </div>

          <div className="p-2 border-b border-[#232b3a]">
            {longTerm && (
              <button
                onClick={() => setSelected({ type: "long_term", item: longTerm })}
                className={[
                  "w-full text-left rounded-md px-3 py-2 border",
                  selected?.type === "long_term"
                    ? "bg-[#4f46e5]/20 border-[#4f46e5]/50 text-white"
                    : "bg-[#141a27] border-[#2a3345] text-neutral-200 hover:bg-[#182031]",
                ].join(" ")}
              >
                <p className="font-semibold">Long-Term Memory</p>
                <p className="text-xs text-neutral-400 mt-0.5">
                  {(longTerm.wordCount ?? countWords(longTerm.content)).toLocaleString()} words • Updated {formatDateTime(longTerm.updatedAt)}
                </p>
              </button>
            )}
          </div>

          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            {filtered.map((entry) => (
              <button
                key={entry.id}
                onClick={() => setSelected({ type: "entry", item: entry })}
                className={[
                  "w-full text-left rounded-md px-3 py-2 border transition-colors",
                  selected?.type === "entry" && selected.item.id === entry.id
                    ? "bg-[#171c27] border-[#3a4660] text-white"
                    : "bg-[#121722] border-[#222b3c] text-neutral-200 hover:bg-[#182031]",
                ].join(" ")}
              >
                <p className="font-medium truncate">{entry.title}</p>
                <p className="text-xs text-neutral-400 mt-0.5">
                  {(entry.wordCount ?? countWords(entry.content)).toLocaleString()} words • {formatDateTime(entry.updatedAt)}
                </p>
              </button>
            ))}
            {!loading && filtered.length === 0 && <p className="text-sm text-neutral-500 p-3">No memory entries found.</p>}
          </div>
        </section>

        <section className="bg-[#0f141f] border border-[#232b3a] rounded-lg overflow-hidden min-h-[600px] flex flex-col">
          <header className="px-4 py-3 border-b border-[#232b3a]">
            <h1 className="text-xl font-semibold">{selected?.item.title ?? "Memory"}</h1>
            <p className="text-xs text-neutral-400 mt-1">
              {selected ? formatDateTime(selected.item.updatedAt) : "Select an entry"}
              {selected?.type === "entry" && selected.item.sourceFile ? ` • ${selected.item.sourceFile}` : ""}
              {selected?.type === "long_term" && selected.item.sourceFile ? ` • ${selected.item.sourceFile}` : ""}
            </p>
          </header>

          <div className="flex-1 overflow-y-auto px-5 py-4">
            {error && <p className="text-sm text-red-400 mb-3">{error}</p>}
            {!selected ? (
              <p className="text-neutral-500">{loading ? "Loading..." : "No memory selected."}</p>
            ) : (
              <article className="prose prose-invert max-w-none">
                <pre className="whitespace-pre-wrap font-sans text-sm leading-7 text-neutral-200 bg-transparent border-0 p-0 m-0">
                  {selected.item.content}
                </pre>
              </article>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
