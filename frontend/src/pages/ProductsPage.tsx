import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { createProduct } from "../lib/data";
import { useProducts } from "../app/providers";

export function ProductsPage() {
  const { products, loading, refresh } = useProducts();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const onCreate = async (event?: FormEvent) => {
    event?.preventDefault();
    if (!name.trim() || busy) return;
    try {
      setBusy(true);
      setError("");
      await createProduct({ name: name.trim() });
      setName("");
      await refresh();
    } catch (nextError) {
      setError((nextError as Error).message || "Failed to create product");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="p-4 lg:p-8 max-w-6xl mx-auto space-y-6">
      <div className="bg-white border border-neutral-200 rounded-lg p-4 space-y-3">
        <h2 className="text-lg font-semibold">Create product</h2>
        <form className="flex gap-2" onSubmit={(event) => void onCreate(event)}>
          <input className="flex-1 border border-neutral-300 rounded-lg px-3 py-2" placeholder="Product name" value={name} onChange={(e) => setName(e.target.value)} />
          <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded-lg disabled:opacity-60" disabled={busy || !name.trim()}>
            {busy ? "Creating..." : "Create"}
          </button>
        </form>
        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>

      <section>
        <h2 className="text-xl font-bold mb-3">Products</h2>
        {loading ? <div className="text-neutral-500">Loading...</div> : null}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {products.map((product) => (
            <Link key={product.id} to={`/products/${product.id}`} className="bg-white border border-neutral-200 rounded-lg p-4 hover:shadow-sm transition-shadow">
              <h3 className="font-semibold text-neutral-900">{product.name}</h3>
              <p className="text-sm text-neutral-600 capitalize mt-1">{product.status}</p>
            </Link>
          ))}
          {!loading && products.length === 0 ? <div className="text-neutral-500">No products yet.</div> : null}
        </div>
      </section>
    </div>
  );
}
