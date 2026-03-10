import { useEffect, useMemo, useRef, useState } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { Menu, PanelLeftClose, PanelLeftOpen, Settings } from "lucide-react";
import { useProducts } from "../providers";
import { useSession } from "../../lib/session";

function useProductFromPath(pathname: string): string | null {
  const match = pathname.match(/^\/products\/([^/]+)/);
  return match?.[1] ?? null;
}

export function AppShell() {
  const navigate = useNavigate();
  const location = useLocation();
  const { products, loading } = useProducts();
  const { user, logout } = useSession();

  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [desktopProductSwitcherOpen, setDesktopProductSwitcherOpen] = useState(false);
  const [desktopNavHidden, setDesktopNavHidden] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [preferredProductId, setPreferredProductId] = useState<string | null>(null);
  const initialPathRef = useRef<string>(location.pathname);
  const hasHandledInitialRedirectRef = useRef(false);

  const activeProductId = useProductFromPath(location.pathname);
  const activeProduct = useMemo(
    () => products.find((product) => product.id === activeProductId) ?? null,
    [products, activeProductId],
  );
  const preferredProduct = useMemo(
    () => products.find((product) => product.id === preferredProductId) ?? null,
    [products, preferredProductId],
  );
  const currentProduct = activeProduct ?? preferredProduct ?? products[0] ?? null;
  const scopedProductId = currentProduct?.id ?? null;

  const isProductView = location.pathname.includes("/products/");
  const isCalendarView = /^\/calendar(\/|$)|^\/products\/[^/]+\/calendar(\/|$)/.test(location.pathname);
  const isMemoryView = /^\/memory(\/|$)/.test(location.pathname);
  const isDocsView = /^\/docs(\/|$)|^\/products\/[^/]+\/docs(\/|$)/.test(location.pathname);
  const isTeamView = /^\/team(\/|$)|^\/products\/[^/]+\/team(\/|$)/.test(location.pathname);
  const isProductsPage = location.pathname === "/products";
  const globalViewTitle = isMemoryView
    ? "Company Memory"
    : isDocsView
      ? "Company Docs"
      : isTeamView
        ? "Company Team"
        : isCalendarView
          ? "OpenClaw Calendar"
          : null;
  const isWorkspaceView = isProductView || isCalendarView || isMemoryView || isDocsView || isTeamView || isProductsPage;
  const productTabs = activeProductId
    ? [
        { label: "Overview", to: `/products/${activeProductId}`, active: location.pathname === `/products/${activeProductId}` },
        { label: "CRM", to: `/products/${activeProductId}/crm`, active: location.pathname.includes(`/products/${activeProductId}/crm`) },
        { label: "Tasks", to: `/products/${activeProductId}/tasks`, active: location.pathname.includes(`/products/${activeProductId}/tasks`) },
        { label: "KPI", to: `/products/${activeProductId}/kpi`, active: location.pathname.includes(`/products/${activeProductId}/kpi`) },
        { label: "Activity", to: `/products/${activeProductId}/activity`, active: location.pathname.includes(`/products/${activeProductId}/activity`) },
        { label: "Calendar", to: `/products/${activeProductId}/calendar`, active: isCalendarView },
      ]
    : scopedProductId
      ? [
          { label: "Overview", to: `/products/${scopedProductId}`, active: false },
          { label: "CRM", to: `/products/${scopedProductId}/crm`, active: false },
          { label: "Tasks", to: `/products/${scopedProductId}/tasks`, active: false },
          { label: "KPI", to: `/products/${scopedProductId}/kpi`, active: false },
          { label: "Activity", to: `/products/${scopedProductId}/activity`, active: false },
          { label: "Calendar", to: `/products/${scopedProductId}/calendar`, active: isCalendarView },
        ]
      : [];
  const companyTabs = [
    { label: "Memory", to: "/memory", active: isMemoryView },
    { label: "Docs", to: scopedProductId ? `/products/${scopedProductId}/docs` : "/docs", active: isDocsView },
    { label: "Team", to: scopedProductId ? `/products/${scopedProductId}/team` : "/team", active: isTeamView },
  ];

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 1024);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  useEffect(() => {
    const stored = window.localStorage.getItem("mc.desktopNavHidden");
    setDesktopNavHidden(stored === "1");
  }, []);

  useEffect(() => {
    const stored = window.localStorage.getItem("mc.lastProductId");
    if (stored) {
      setPreferredProductId(stored);
    }
  }, []);

  useEffect(() => {
    if (isMobile) {
      setMobileSidebarOpen(false);
      setDesktopProductSwitcherOpen(false);
    }
  }, [location.pathname, isMobile]);

  useEffect(() => {
    if (desktopNavHidden) {
      setDesktopProductSwitcherOpen(false);
    }
    window.localStorage.setItem("mc.desktopNavHidden", desktopNavHidden ? "1" : "0");
  }, [desktopNavHidden]);

  useEffect(() => {
    if (activeProductId) {
      setPreferredProductId(activeProductId);
      window.localStorage.setItem("mc.lastProductId", activeProductId);
      return;
    }

    if (products.length === 0) {
      return;
    }

    if (!preferredProductId || !products.some((product) => product.id === preferredProductId)) {
      const fallback = products[0].id;
      setPreferredProductId(fallback);
      window.localStorage.setItem("mc.lastProductId", fallback);
    }
  }, [activeProductId, preferredProductId, products]);

  useEffect(() => {
    if (hasHandledInitialRedirectRef.current || loading) {
      return;
    }
    hasHandledInitialRedirectRef.current = true;

    const initialPath = initialPathRef.current;
    if ((initialPath === "/" || initialPath === "/products") && currentProduct) {
      navigate(`/products/${currentProduct.id}`, { replace: true });
    }
  }, [currentProduct, loading, navigate]);

  return (
    <div className="mc-theme h-screen flex flex-col overflow-hidden bg-[#090b10] text-neutral-100">
      <header className="h-14 border-b border-[#1b1f2a] bg-[#0d1118] flex items-center px-3 lg:px-4 shrink-0 z-30">
        {isWorkspaceView ? (
          <button
            onClick={() => setMobileSidebarOpen((current) => !current)}
            className="lg:hidden p-2 hover:bg-neutral-100 rounded-md transition-colors"
            aria-label="Toggle sidebar"
          >
            <Menu className="w-5 h-5" />
          </button>
        ) : (
          <div className="w-9" />
        )}

        <div className="ml-2 flex-1 min-w-0">
          {currentProduct ? (
            <button
              onClick={() => {
                if (isWorkspaceView && !isMobile) {
                  setDesktopProductSwitcherOpen((current) => !current);
                  return;
                }
                navigate(`/products/${currentProduct.id}`);
              }}
              className="font-semibold text-neutral-100 hover:text-white truncate"
            >
              {currentProduct.name} {!isMobile ? "▾" : ""}
            </button>
          ) : globalViewTitle ? (
            <h1 className="font-semibold text-neutral-100 truncate">{globalViewTitle}</h1>
          ) : (
            <h1 className="font-semibold text-neutral-100">Product OS</h1>
          )}
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={() => navigate("/settings")}
            className="p-2 hover:bg-[#161c27] rounded-md transition-colors text-neutral-300"
            aria-label="Settings"
          >
            <Settings className="w-5 h-5" />
          </button>
          {user && (
            <button className="text-sm px-3 py-1.5 rounded-md bg-[#161c27] hover:bg-[#1d2634] text-neutral-100" onClick={() => void logout()}>
              Log out
            </button>
          )}
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {isWorkspaceView && desktopNavHidden && (
          <aside className="hidden lg:flex lg:w-12 bg-[#0b1017] border-r-2 border-[#2b3448] items-start justify-center pt-3">
            <button
              onClick={() => setDesktopNavHidden(false)}
              className="p-2 hover:bg-[#161c27] rounded-md transition-colors text-neutral-300"
              aria-label="Expand sidebar"
              title="Expand sidebar"
            >
              <PanelLeftOpen className="w-5 h-5" />
            </button>
          </aside>
        )}

        {isWorkspaceView && !desktopNavHidden && (
          <>
            {desktopProductSwitcherOpen && (
              <aside className="hidden lg:flex lg:w-64 xl:w-72 border-r border-[#1b1f2a] bg-[#0d1118] flex-col">
                <div className="p-3 border-b border-[#1b1f2a]">
                  <h2 className="text-[11px] uppercase tracking-wide text-neutral-500 font-semibold">Products</h2>
                </div>
                <nav className="flex-1 overflow-y-auto p-2">
                  {products.map((product) => (
                    <NavLink
                      key={product.id}
                      to={`/products/${product.id}`}
                      end
                      onClick={() => setDesktopProductSwitcherOpen(false)}
                      className={({ isActive }) =>
                        [
                          "w-full text-left p-3 rounded-md transition-colors mb-1 block",
                          isActive ? "bg-[#171c27] text-white border border-[#2d3750]" : "hover:bg-[#121722] text-neutral-300",
                        ].join(" ")
                      }
                    >
                      <div className="font-medium truncate">{product.name}</div>
                      <div className="text-xs text-neutral-500 capitalize">{product.status}</div>
                    </NavLink>
                  ))}
                  {!loading && products.length === 0 && <div className="p-3 text-sm text-neutral-500">No products yet.</div>}
                </nav>
                <div className="p-3 border-t border-[#1b1f2a]">
                  <Link
                    to="/products"
                    onClick={() => setDesktopProductSwitcherOpen(false)}
                    className="block text-sm text-neutral-400 hover:text-white hover:bg-[#121722] rounded-md px-2 py-2"
                  >
                    All products
                  </Link>
                </div>
              </aside>
            )}

            <aside className="hidden lg:flex lg:w-56 border-r border-[#1b1f2a] bg-[#0b1017] flex-col">
              <div className="p-3 border-b border-[#1b1f2a] flex items-center justify-between gap-2">
                <h2 className="text-[11px] uppercase tracking-wide text-neutral-500 font-semibold">Product</h2>
                <button
                  onClick={() => setDesktopNavHidden(true)}
                  className="p-1.5 hover:bg-[#161c27] rounded-md transition-colors text-neutral-300"
                  aria-label="Hide sidebar"
                  title="Hide sidebar"
                >
                  <PanelLeftClose className="w-4 h-4" />
                </button>
              </div>
              <nav className="p-2 space-y-1 border-b border-[#1b1f2a]">
                {productTabs.map((tab) => (
                  <Link
                    key={tab.to}
                    to={tab.to}
                    className={[
                      "block rounded-md px-3 py-2 text-sm font-medium transition-colors",
                      tab.active ? "bg-[#4f46e5] text-white" : "text-neutral-300 hover:bg-[#161c27]",
                    ].join(" ")}
                  >
                    {tab.label}
                  </Link>
                ))}
                {productTabs.length === 0 && <p className="px-3 py-2 text-sm text-neutral-500">Select a product to view product modules.</p>}
              </nav>
              <div className="p-3 border-b border-[#1b1f2a]">
                <h2 className="text-[11px] uppercase tracking-wide text-neutral-500 font-semibold">Company</h2>
              </div>
              <nav className="p-2 space-y-1">
                {companyTabs.map((tab) => (
                  <Link
                    key={tab.to}
                    to={tab.to}
                    className={[
                      "block rounded-md px-3 py-2 text-sm font-medium transition-colors",
                      tab.active ? "bg-[#4f46e5] text-white" : "text-neutral-300 hover:bg-[#161c27]",
                    ].join(" ")}
                  >
                    {tab.label}
                  </Link>
                ))}
              </nav>
            </aside>
          </>
        )}

        {isWorkspaceView && isMobile && mobileSidebarOpen && (
          <>
            <div className="fixed inset-0 bg-black/40 z-30" style={{ top: "3.5rem" }} onClick={() => setMobileSidebarOpen(false)} />
            <aside className="fixed left-0 right-0 top-14 bottom-0 z-40 bg-[#0d1118] border-t border-[#1b1f2a] overflow-y-auto">
              <div className="p-3 border-b border-[#1b1f2a]">
                <h2 className="text-[11px] uppercase tracking-wide text-neutral-500 font-semibold">Products</h2>
              </div>
              <nav className="p-2 border-b border-[#1b1f2a]">
                {products.map((product) => (
                  <Link
                    key={product.id}
                    to={`/products/${product.id}`}
                    className={[
                      "block rounded-md px-3 py-2 text-sm mb-1",
                      product.id === activeProductId ? "bg-[#171c27] text-white font-medium" : "text-neutral-300 hover:bg-[#121722]",
                    ].join(" ")}
                  >
                    {product.name}
                  </Link>
                ))}
              </nav>

              <div className="p-3 border-b border-[#1b1f2a]">
                <h2 className="text-[11px] uppercase tracking-wide text-neutral-500 font-semibold">Product</h2>
              </div>
              <nav className="p-2 border-b border-[#1b1f2a]">
                {productTabs.map((tab) => (
                  <Link
                    key={tab.to}
                    to={tab.to}
                    className={[
                      "block rounded-md px-3 py-2 text-sm mb-1",
                      tab.active ? "bg-[#4f46e5] text-white font-medium" : "text-neutral-300 hover:bg-[#121722]",
                    ].join(" ")}
                  >
                    {tab.label}
                  </Link>
                ))}
                {productTabs.length === 0 && <p className="px-3 py-2 text-sm text-neutral-500">Select a product to view product modules.</p>}
              </nav>

              <div className="p-3 border-b border-[#1b1f2a]">
                <h2 className="text-[11px] uppercase tracking-wide text-neutral-500 font-semibold">Company</h2>
              </div>
              <nav className="p-2">
                {companyTabs.map((tab) => (
                  <Link
                    key={tab.to}
                    to={tab.to}
                    className={[
                      "block rounded-md px-3 py-2 text-sm mb-1",
                      tab.active ? "bg-[#4f46e5] text-white font-medium" : "text-neutral-300 hover:bg-[#121722]",
                    ].join(" ")}
                  >
                    {tab.label}
                  </Link>
                ))}
              </nav>
            </aside>
          </>
        )}

        <main className="flex-1 overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
