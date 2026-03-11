import { OWNER_UID } from "../lib/firebase";
import { useSession } from "../lib/session";

export function SettingsPage() {
  const { user, hasAuthConfig, skipAuth } = useSession();
  const ownerStatus = OWNER_UID ? OWNER_UID : "Not configured";

  return (
    <div className="p-4 lg:p-8 max-w-4xl mx-auto space-y-4">
      <h1 className="text-2xl font-bold">Settings</h1>
      <div className="bg-white border border-neutral-200 rounded-lg p-4 space-y-2 text-sm">
        <p>Owner UID: {ownerStatus}</p>
        <p>Auth configured: {hasAuthConfig ? "yes" : "no"}</p>
        <p>Skip auth: {skipAuth ? "enabled" : "disabled"}</p>
        <p>Current user: {user?.email ?? "anonymous"}</p>
        <p>Current user uid: {user?.uid ?? "none"}</p>
        {!OWNER_UID ? (
          <p className="text-red-700">
            Access is blocked until owner is configured. Set <code>VITE_OWNER_UID</code> (frontend) and <code>OWNER_UID</code> (functions runtime).
          </p>
        ) : null}
      </div>
    </div>
  );
}
