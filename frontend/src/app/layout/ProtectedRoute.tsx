import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useSession } from "../../lib/session";

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { loading, user, isOwner, hasAuthConfig, skipAuth } = useSession();

  if (loading) {
    return <section className="card">Loading session...</section>;
  }

  if (skipAuth || !hasAuthConfig) {
    return children;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (!isOwner) {
    return (
      <section className="stack">
        <h2>Access denied</h2>
        <p>This dashboard is private and owner-only.</p>
      </section>
    );
  }

  return children;
}
