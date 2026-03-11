import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useSession } from "../../lib/session";

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { loading, user, isOwner, hasAuthConfig, skipAuth, logout } = useSession();

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
      <section className="min-h-screen flex items-center justify-center p-6 bg-neutral-100">
        <div className="w-full max-w-md bg-white border border-neutral-200 rounded-xl p-6 space-y-3">
          <h2 className="text-xl font-bold">Access denied</h2>
          <p className="text-sm text-neutral-700">This dashboard is private and owner-only.</p>
          <button
            type="button"
            onClick={() => void logout()}
            className="w-full px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            Sign out and switch account
          </button>
        </div>
      </section>
    );
  }

  return children;
}
