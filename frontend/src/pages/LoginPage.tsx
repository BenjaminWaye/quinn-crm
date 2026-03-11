import { signInWithPopup } from "firebase/auth";
import { useState, type FormEvent } from "react";
import { Navigate } from "react-router-dom";
import { auth, googleProvider } from "../lib/firebase";
import { useSession } from "../lib/session";

export function LoginPage() {
  const { user, isOwner, hasAuthConfig, skipAuth } = useSession();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  if (skipAuth || (user && (!hasAuthConfig || isOwner))) {
    return <Navigate to="/products" replace />;
  }

  const onLogin = async (event?: FormEvent) => {
    event?.preventDefault();
    if (!auth || busy) return;
    try {
      setBusy(true);
      setError("");
      await signInWithPopup(auth, googleProvider);
    } catch (nextError) {
      setError((nextError as Error)?.message || "Login failed");
      console.error("Login failed", nextError);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="min-h-screen flex items-center justify-center p-6 bg-neutral-100">
      <div className="w-full max-w-md bg-white border border-neutral-200 rounded-xl p-6 space-y-4">
        <h1 className="text-2xl font-bold">Product OS</h1>
        <p className="text-neutral-600 text-sm">Sign in with your owner account.</p>
        {!hasAuthConfig ? (
          <p className="text-sm text-neutral-500">Firebase Auth not configured. Set env vars or enable `VITE_SKIP_AUTH`.</p>
        ) : (
          <form onSubmit={(event) => void onLogin(event)}>
            <button type="submit" className="w-full px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-60" disabled={busy}>
              {busy ? "Signing in..." : "Continue with Google"}
            </button>
          </form>
        )}
        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>
    </section>
  );
}
