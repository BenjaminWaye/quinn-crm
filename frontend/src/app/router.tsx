import { Navigate, createBrowserRouter } from "react-router-dom";
import { AppShell } from "./layout/AppShell";
import { ProtectedRoute } from "./layout/ProtectedRoute";
import { LoginPage } from "../pages/LoginPage";
import { ProductsPage } from "../pages/ProductsPage";
import { ProductOverviewPage } from "../pages/ProductOverviewPage";
import { ProductCrmPage } from "../pages/ProductCrmPage";
import { ProductContactPage } from "../pages/ProductContactPage";
import { ProductTasksPage } from "../pages/ProductTasksPage";
import { ProductTaskPage } from "../pages/ProductTaskPage";
import { ProductKpiPage } from "../pages/ProductKpiPage";
import { ProductActivityPage } from "../pages/ProductActivityPage";
import { CalendarPage } from "../pages/CalendarPage";
import { MemoryPage } from "../pages/MemoryPage";
import { DocsPage } from "../pages/DocsPage";
import { TeamPage } from "../pages/TeamPage";
import { SettingsPage } from "../pages/SettingsPage";
import { NotFoundPage } from "../pages/NotFoundPage";

export const router = createBrowserRouter([
  { path: "/login", element: <LoginPage /> },
  {
    path: "/",
    element: (
      <ProtectedRoute>
        <AppShell />
      </ProtectedRoute>
    ),
    children: [
      { index: true, element: <ProductsPage /> },
      { path: "products", element: <ProductsPage /> },
      { path: "products/:productId", element: <ProductOverviewPage /> },
      { path: "products/:productId/crm", element: <ProductCrmPage /> },
      { path: "products/:productId/crm/:contactId", element: <ProductContactPage /> },
      { path: "products/:productId/tasks", element: <ProductTasksPage /> },
      { path: "products/:productId/tasks/:taskId", element: <ProductTaskPage /> },
      { path: "products/:productId/kpi", element: <ProductKpiPage /> },
      { path: "products/:productId/activity", element: <ProductActivityPage /> },
      { path: "products/:productId/calendar", element: <CalendarPage /> },
      { path: "products/:productId/memory", element: <Navigate to="/memory" replace /> },
      { path: "products/:productId/docs", element: <DocsPage /> },
      { path: "products/:productId/team", element: <TeamPage /> },
      { path: "calendar", element: <CalendarPage /> },
      { path: "memory", element: <MemoryPage /> },
      { path: "docs", element: <DocsPage /> },
      { path: "team", element: <TeamPage /> },
      { path: "settings", element: <SettingsPage /> },
      { path: "*", element: <NotFoundPage /> },
    ],
  },
]);
