import { OWNER_UID } from "../lib/firebase";
import { useSession } from "../lib/session";

export function SettingsPage() {
  const { user, hasAuthConfig, skipAuth } = useSession();

  return (
    <div className="p-4 lg:p-8 max-w-4xl mx-auto space-y-4">
      <h1 className="text-2xl font-bold">Settings</h1>
      <div className="bg-white border border-neutral-200 rounded-lg p-4 space-y-2 text-sm">
        <p>Owner UID: {OWNER_UID || "not set"}</p>
        <p>Auth configured: {hasAuthConfig ? "yes" : "no"}</p>
        <p>Skip auth: {skipAuth ? "enabled" : "disabled"}</p>
        <p>Current user: {user?.email ?? "anonymous"}</p>
      </div>
    </div>
  );
}
