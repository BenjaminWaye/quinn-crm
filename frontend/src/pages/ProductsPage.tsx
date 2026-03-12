import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { createProduct } from "../lib/data";
import { useProducts } from "../app/providers";

export function ProductsPage() {
  const { products, loading, refresh, upsertProductLocal } = useProducts();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [repo, setRepo] = useState("");
  const [description, setDescription] = useState("");
  const [mission, setMission] = useState("");
  const [discordChannelId, setDiscordChannelId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const onCreate = async (event?: FormEvent) => {
    event?.preventDefault();
    if (!name.trim() || busy) return;
    try {
      setBusy(true);
      setError("");
      const result = await createProduct({
        name: name.trim(),
        repo: repo.trim(),
        description: description.trim(),
        mission: mission.trim(),
        discordChannelId: discordChannelId.trim(),
      });
      upsertProductLocal({
        id: result.data.productId,
        name: name.trim(),
        status: "active",
        repo: repo.trim(),
        description: description.trim(),
        mission: mission.trim(),
        discordChannelId: discordChannelId.trim(),
      });
      setName("");
      setRepo("");
      setDescription("");
      setMission("");
      setDiscordChannelId("");
      setOpen(false);
      void refresh();
    } catch (nextError) {
      setError((nextError as Error).message || "Failed to create product");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="p-4 lg:p-8 max-w-6xl mx-auto space-y-6">
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xl font-bold">Products</h2>
          <button
            type="button"
            onClick={() => {
              setError("");
              setOpen(true);
            }}
            className="px-3 py-2 rounded-lg bg-blue-600 text-white text-sm"
          >
            + Add new product
          </button>
        </div>
        {loading ? <div className="text-neutral-500">Loading...</div> : null}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {products.map((product) => (
            <Link key={product.id} to={`/products/${product.id}`} className="bg-white border border-neutral-200 rounded-lg p-4 hover:shadow-sm transition-shadow">
              <h3 className="font-semibold text-neutral-900">{product.name}</h3>
              <p className="text-sm text-neutral-600 capitalize mt-1">{product.status}</p>
              {product.repo ? <p className="text-xs text-neutral-500 mt-2 truncate">{product.repo}</p> : null}
              {product.description ? <p className="text-xs text-neutral-500 mt-1 line-clamp-2">{product.description}</p> : null}
            </Link>
          ))}
          {!loading && products.length === 0 ? <div className="text-neutral-500">No products yet.</div> : null}
        </div>
      </section>

      {open && (
        <div className="fixed inset-0 z-40 flex items-start justify-center p-4 sm:p-6" onClick={() => !busy && setOpen(false)}>
          <div className="absolute inset-0 bg-black/40" />
          <div className="relative z-10 w-full max-w-xl bg-white border border-neutral-200 rounded-lg p-4 space-y-3" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold">Add new product</h3>
              <button type="button" className="text-sm text-neutral-500 hover:text-neutral-700" onClick={() => !busy && setOpen(false)}>
                Close
              </button>
            </div>
            <form className="space-y-2" onSubmit={(event) => void onCreate(event)}>
              <input className="w-full border border-neutral-300 rounded-lg px-3 py-2" placeholder="Product name" value={name} onChange={(e) => setName(e.target.value)} />
              <input className="w-full border border-neutral-300 rounded-lg px-3 py-2" placeholder="Repo URL (optional)" value={repo} onChange={(e) => setRepo(e.target.value)} />
              <textarea className="w-full border border-neutral-300 rounded-lg px-3 py-2 min-h-[90px]" placeholder="Description (optional)" value={description} onChange={(e) => setDescription(e.target.value)} />
              <textarea className="w-full border border-neutral-300 rounded-lg px-3 py-2 min-h-[90px]" placeholder="Mission (optional)" value={mission} onChange={(e) => setMission(e.target.value)} />
              <input className="w-full border border-neutral-300 rounded-lg px-3 py-2" placeholder="Discord channel id for this product (optional)" value={discordChannelId} onChange={(e) => setDiscordChannelId(e.target.value)} />
              <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded-lg disabled:opacity-60" disabled={busy || !name.trim()}>
                {busy ? "Creating..." : "Create product"}
              </button>
            </form>
            {error && <p className="text-sm text-red-600">{error}</p>}
          </div>
        </div>
      )}
    </div>
  );
}
