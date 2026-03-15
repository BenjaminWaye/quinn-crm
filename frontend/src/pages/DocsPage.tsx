import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { listOpenClawDocs, type OpenClawDoc } from "../lib/data";
import { formatDateTime } from "../lib/time";

function inferDocType(doc: OpenClawDoc): string {
  const raw = (doc.type || "").trim().toLowerCase();
  if (raw) return raw.startsWith(".") ? raw : `.${raw}`;
  const fromName = (doc.name || "").toLowerCase();
  const fromSource = (doc.sourceFile || "").toLowerCase();
  const match = (fromName || fromSource).match(/\.[a-z0-9]+$/);
  return match ? match[0] : "unknown";
}

function isUrlLike(value: string): boolean {
  const trimmed = value.trim().toLowerCase();
  return trimmed.startsWith("http://") || trimmed.startsWith("https://") || trimmed.startsWith("data:");
}

function resolveAssetSrc(doc: OpenClawDoc): string | null {
  const content = (doc.content || "").trim();
  if (content && isUrlLike(content)) return content;
  const downloadUrl = (doc.downloadUrl || "").trim();
  if (downloadUrl && isUrlLike(downloadUrl)) return downloadUrl;
  const source = (doc.sourceFile || "").trim();
  if (source && isUrlLike(source)) return source;
  return null;
}

function MarkdownView({ content }: { content: string }) {
  const lines = content.replace(/\r\n/g, "\n").split("\n");
  const blocks: Array<{ type: string; value: string | string[] }> = [];
  let paragraph: string[] = [];
  let list: string[] = [];
  let ordered = false;
  let code: string[] = [];
  let inCode = false;

  const flushParagraph = () => {
    if (paragraph.length > 0) {
      blocks.push({ type: "p", value: paragraph.join(" ") });
      paragraph = [];
    }
  };

  const flushList = () => {
    if (list.length > 0) {
      blocks.push({ type: ordered ? "ol" : "ul", value: [...list] });
      list = [];
    }
  };

  const flushCode = () => {
    if (code.length > 0) {
      blocks.push({ type: "code", value: code.join("\n") });
      code = [];
    }
  };

  for (const line of lines) {
    if (line.trim().startsWith("```")) {
      flushParagraph();
      flushList();
      if (inCode) {
        flushCode();
      }
      inCode = !inCode;
      continue;
    }

    if (inCode) {
      code.push(line);
      continue;
    }

    const heading = line.match(/^(#{1,6})\s+(.+)$/);
    if (heading) {
      flushParagraph();
      flushList();
      blocks.push({ type: `h${heading[1].length}`, value: heading[2] });
      continue;
    }

    const unorderedMatch = line.match(/^[-*]\s+(.+)$/);
    if (unorderedMatch) {
      flushParagraph();
      if (ordered) {
        flushList();
        ordered = false;
      }
      list.push(unorderedMatch[1]);
      continue;
    }

    const orderedMatch = line.match(/^\d+\.\s+(.+)$/);
    if (orderedMatch) {
      flushParagraph();
      if (!ordered && list.length > 0) {
        flushList();
      }
      ordered = true;
      list.push(orderedMatch[1]);
      continue;
    }

    if (!line.trim()) {
      flushParagraph();
      flushList();
      continue;
    }

    paragraph.push(line.trim());
  }

  flushParagraph();
  flushList();
  flushCode();

  return (
    <article className="space-y-3 text-sm text-neutral-200 leading-7">
      {blocks.map((block, index) => {
        const key = `${block.type}-${index}`;
        if (block.type === "h1") return <h1 key={key} className="text-2xl font-semibold mt-2">{block.value as string}</h1>;
        if (block.type === "h2") return <h2 key={key} className="text-xl font-semibold mt-2">{block.value as string}</h2>;
        if (block.type === "h3") return <h3 key={key} className="text-lg font-semibold mt-2">{block.value as string}</h3>;
        if (block.type === "h4") return <h4 key={key} className="text-base font-semibold mt-2">{block.value as string}</h4>;
        if (block.type === "h5") return <h5 key={key} className="text-sm font-semibold mt-2">{block.value as string}</h5>;
        if (block.type === "h6") return <h6 key={key} className="text-sm font-semibold mt-2 text-neutral-300">{block.value as string}</h6>;
        if (block.type === "ul") {
          return (
            <ul key={key} className="list-disc pl-5 space-y-1">
              {(block.value as string[]).map((item, itemIndex) => <li key={`${key}-li-${itemIndex}`}>{item}</li>)}
            </ul>
          );
        }
        if (block.type === "ol") {
          return (
            <ol key={key} className="list-decimal pl-5 space-y-1">
              {(block.value as string[]).map((item, itemIndex) => <li key={`${key}-li-${itemIndex}`}>{item}</li>)}
            </ol>
          );
        }
        if (block.type === "code") {
          return (
            <pre key={key} className="rounded-md border border-[#2a3345] bg-[#0c1017] p-3 overflow-x-auto text-xs leading-6 text-neutral-100">
              {block.value as string}
            </pre>
          );
        }
        return <p key={key}>{block.value as string}</p>;
      })}
    </article>
  );
}

function DocumentContent({ doc }: { doc: OpenClawDoc | null }) {
  if (!doc) return null;
  const docType = inferDocType(doc);
  const src = resolveAssetSrc(doc);
  const lowerType = docType.toLowerCase();

  if ([".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg"].includes(lowerType)) {
    if (!src) return <p className="text-neutral-500 text-sm">Image source missing. Provide a URL/data URI in content/sourceFile, or include downloadUrl in syncDocs.</p>;
    return (
      <div className="flex items-center justify-center">
        <img src={src} alt={doc.name} className="max-w-full max-h-[70vh] rounded-md border border-[#2a3345]" />
      </div>
    );
  }

  if (lowerType === ".pdf") {
    if (!src) return <p className="text-neutral-500 text-sm">PDF source missing. Provide a URL/data URI in content/sourceFile, or include downloadUrl in syncDocs.</p>;
    return (
      <div className="h-[70vh] border border-[#2a3345] rounded-md overflow-hidden bg-[#0c1017]">
        <iframe title={doc.name} src={src} className="w-full h-full" />
      </div>
    );
  }

  if ([".mp3", ".wav", ".ogg", ".m4a"].includes(lowerType)) {
    if (!src) return <p className="text-neutral-500 text-sm">Audio source missing. Provide a URL/data URI in content/sourceFile, or include downloadUrl in syncDocs.</p>;
    return (
      <div className="space-y-3">
        <audio controls className="w-full">
          <source src={src} />
        </audio>
        <a href={src} target="_blank" rel="noreferrer" className="text-sm text-indigo-300 hover:text-indigo-200 hover:underline">
          Open audio in new tab
        </a>
      </div>
    );
  }

  if ([".mp4", ".webm", ".mov", ".m4v"].includes(lowerType)) {
    if (!src) return <p className="text-neutral-500 text-sm">Video source missing. Provide a URL/data URI in content/sourceFile, or include downloadUrl in syncDocs.</p>;
    return (
      <div className="space-y-3">
        <video controls className="w-full max-h-[70vh] rounded-md border border-[#2a3345] bg-black">
          <source src={src} />
        </video>
        <a href={src} target="_blank" rel="noreferrer" className="text-sm text-indigo-300 hover:text-indigo-200 hover:underline">
          Open video in new tab
        </a>
      </div>
    );
  }

  if (lowerType === ".md") {
    return <MarkdownView content={doc.content || ""} />;
  }

  if (lowerType === ".html") {
    const html = doc.content || "";
    return (
      <div className="space-y-3">
        <div className="h-[70vh] border border-[#2a3345] rounded-md overflow-hidden bg-white">
          <iframe title={doc.name} srcDoc={html} className="w-full h-full" />
        </div>
        <details className="text-xs text-neutral-400">
          <summary className="cursor-pointer">Show raw HTML</summary>
          <pre className="mt-2 whitespace-pre-wrap rounded-md border border-[#2a3345] bg-[#0c1017] p-3 text-neutral-300">{html}</pre>
        </details>
      </div>
    );
  }

  return (
    <pre className="whitespace-pre-wrap font-sans text-sm leading-7 text-neutral-200 bg-transparent border-0 p-0 m-0">
      {doc.content}
    </pre>
  );
}

export function DocsPage() {
  const [docs, setDocs] = useState<OpenClawDoc[]>([]);
  const [selectedId, setSelectedId] = useState<string>("");
  const [mobileDocOpen, setMobileDocOpen] = useState(false);
  const [shareMessage, setShareMessage] = useState("");
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
  const onSelectDoc = (docId: string) => {
    setSelectedId(docId);
    setMobileDocOpen(true);
  };

  const clearShareMessageSoon = () => {
    window.setTimeout(() => setShareMessage(""), 2500);
  };

  const docSharePayload = useMemo(() => {
    if (!selected) return "";
    const linked = (selected.linkedTasks ?? []).map((task) => `${task.productId}:${task.taskId}`);
    return JSON.stringify(
      {
        docId: selected.id,
        name: selected.name,
        type: inferDocType(selected),
        sourceFile: selected.sourceFile ?? "",
        linkedTaskKeys: linked,
      },
      null,
      2,
    );
  }, [selected]);

  const onCopyDocId = async () => {
    if (!selected) return;
    try {
      await navigator.clipboard.writeText(selected.id);
      setShareMessage("Document ID copied");
      clearShareMessageSoon();
    } catch (nextError) {
      console.error("Failed to copy document id", nextError);
      setShareMessage("Could not copy document ID");
      clearShareMessageSoon();
    }
  };

  const onShareDoc = async () => {
    if (!selected) return;
    const shareText = `Document reference\ndocId=${selected.id}\n\n${docSharePayload}`;
    try {
      if (typeof navigator.share === "function") {
        await navigator.share({
          title: `OpenClaw document reference: ${selected.name}`,
          text: shareText,
        });
        setShareMessage("Shared with OpenClaw reference");
      } else {
        await navigator.clipboard.writeText(shareText);
        setShareMessage("OpenClaw document payload copied");
      }
      clearShareMessageSoon();
    } catch (nextError) {
      console.error("Failed to share document", nextError);
      setShareMessage("Could not share document reference");
      clearShareMessageSoon();
    }
  };

  return (
    <div className="p-3 lg:p-6 max-w-[1700px] mx-auto h-full relative">
      <div className="h-full grid grid-cols-1 xl:grid-cols-[380px_minmax(0,1fr)] gap-4">
        <section className="bg-[#0f141f] border border-[#232b3a] rounded-lg overflow-hidden flex flex-col min-h-[500px] lg:min-h-[620px]">
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
                onClick={() => onSelectDoc(doc.id)}
                className={[
                  "w-full text-left rounded-md px-3 py-2 border transition-colors",
                  selected?.id === doc.id
                    ? "bg-[#171c27] border-[#3a4660] text-white"
                    : "bg-[#121722] border-[#222b3c] text-neutral-200 hover:bg-[#182031]",
                ].join(" ")}
              >
                <p className="font-medium truncate">{doc.name}</p>
                <p className="text-xs text-neutral-400 mt-0.5">
                  {(doc.wordCount ?? 0).toLocaleString()} words • {inferDocType(doc)}
                </p>
                <p className="text-xs text-neutral-500 mt-0.5">Modified {formatDateTime(doc.modifiedAt)}</p>
              </button>
            ))}
            {!loading && filtered.length === 0 && <p className="text-sm text-neutral-500 p-3">No documents found.</p>}
          </div>
        </section>

        <section className="hidden xl:flex bg-[#0f141f] border border-[#232b3a] rounded-lg overflow-hidden min-h-[620px] flex-col">
          <header className="px-4 py-3 border-b border-[#232b3a]">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h1 className="text-xl font-semibold truncate">{selected?.name ?? "Document"}</h1>
                <p className="text-xs text-neutral-400 mt-1">
                  {selected ? inferDocType(selected) : "unknown"} • Modified {formatDateTime(selected?.modifiedAt)}
                  {selected?.sourceFile ? ` • ${selected.sourceFile}` : ""}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => void onCopyDocId()}
                  disabled={!selected}
                  className="px-3 py-1.5 rounded-md border border-[#2a3345] text-xs text-neutral-200 hover:bg-[#161c27] disabled:opacity-60"
                >
                  Copy ID
                </button>
                <button
                  type="button"
                  onClick={() => void onShareDoc()}
                  disabled={!selected}
                  className="px-3 py-1.5 rounded-md border border-[#2a3345] text-xs text-neutral-200 hover:bg-[#161c27] disabled:opacity-60"
                >
                  Share with OpenClaw
                </button>
              </div>
            </div>
            {shareMessage ? <p className="text-xs text-neutral-400 mt-2">{shareMessage}</p> : null}
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
              <DocumentContent doc={selected} />
            )}
          </div>
        </section>
      </div>

      <div
        className={[
          "xl:hidden fixed top-14 bottom-0 right-0 z-40 w-[92vw] max-w-[680px] bg-[#0f141f] border-l border-[#232b3a] shadow-2xl transition-transform duration-300",
          mobileDocOpen ? "translate-x-0" : "translate-x-full",
        ].join(" ")}
      >
        <header className="px-4 py-3 border-b border-[#232b3a] flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-base font-semibold truncate">{selected?.name ?? "Document"}</h1>
            <p className="text-xs text-neutral-400 mt-1 truncate">
              {selected ? inferDocType(selected) : "unknown"} • Modified {formatDateTime(selected?.modifiedAt)}
            </p>
          </div>
          <div className="shrink-0 flex items-center gap-2">
            <button
              type="button"
              onClick={() => void onShareDoc()}
              disabled={!selected}
              className="rounded-md border border-[#2a3345] px-2.5 py-1.5 text-xs text-neutral-200 hover:bg-[#161c27] disabled:opacity-60"
            >
              Share
            </button>
            <button
              type="button"
              onClick={() => setMobileDocOpen(false)}
              className="rounded-md border border-[#2a3345] px-3 py-1.5 text-sm text-neutral-200 hover:bg-[#161c27]"
            >
              Back
            </button>
          </div>
        </header>
        {shareMessage ? <p className="px-4 py-2 text-xs text-neutral-400 border-b border-[#232b3a]">{shareMessage}</p> : null}

        <div className="px-4 py-3 border-b border-[#232b3a]">
          <p className="text-xs uppercase tracking-wide text-neutral-500 font-semibold mb-2">Linked tasks</p>
          <div className="flex gap-2 flex-wrap">
            {(selected?.linkedTasks ?? []).map((task) => (
              <Link
                key={`${task.productId}:${task.taskId}`}
                to={`/products/${task.productId}/tasks/${task.taskId}`}
                onClick={() => setMobileDocOpen(false)}
                className="px-2.5 py-1 rounded border border-[#2a3345] text-xs text-neutral-200 hover:bg-[#161c27]"
              >
                {task.title || `${task.productId}/${task.taskId}`}
              </Link>
            ))}
            {selected && (selected.linkedTasks ?? []).length === 0 && <span className="text-xs text-neutral-500">No linked tasks</span>}
          </div>
        </div>

        <div className="h-[calc(100%-133px)] overflow-y-auto px-4 py-4">
          {error && <p className="text-sm text-red-400 mb-3">{error}</p>}
          {!selected ? (
            <p className="text-neutral-500">{loading ? "Loading..." : "No document selected."}</p>
          ) : (
            <DocumentContent doc={selected} />
          )}
        </div>
      </div>

      {mobileDocOpen && <button type="button" aria-label="Close document panel" className="xl:hidden fixed inset-0 bg-black/45 z-30" onClick={() => setMobileDocOpen(false)} />}
    </div>
  );
}
