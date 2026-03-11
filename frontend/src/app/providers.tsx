import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { listProducts, type ProductRecord } from "../lib/data";
import { SessionProvider } from "../lib/session";

type ProductsContextValue = {
  products: ProductRecord[];
  loading: boolean;
  refresh: () => Promise<void>;
  upsertProductLocal: (product: ProductRecord) => void;
};

const ProductsContext = createContext<ProductsContextValue | null>(null);

function ProductsProvider({ children }: { children: ReactNode }) {
  const [products, setProducts] = useState<ProductRecord[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = async () => {
    try {
      setLoading(true);
      setProducts(await listProducts());
    } catch (error) {
      console.error("Failed to load products", error);
      setProducts([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  const upsertProductLocal = (product: ProductRecord) => {
    setProducts((current) => {
      const next = [...current];
      const index = next.findIndex((item) => item.id === product.id);
      if (index >= 0) {
        next[index] = { ...next[index], ...product };
      } else {
        next.push(product);
      }
      return next.sort((a, b) => (a.order ?? Number.MAX_SAFE_INTEGER) - (b.order ?? Number.MAX_SAFE_INTEGER));
    });
  };

  const value = useMemo(() => ({ products, loading, refresh, upsertProductLocal }), [products, loading]);

  return <ProductsContext.Provider value={value}>{children}</ProductsContext.Provider>;
}

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <SessionProvider>
      <ProductsProvider>{children}</ProductsProvider>
    </SessionProvider>
  );
}

export function useProducts() {
  const context = useContext(ProductsContext);
  if (!context) {
    throw new Error("useProducts must be used within AppProviders");
  }
  return context;
}
