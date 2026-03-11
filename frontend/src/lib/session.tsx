import { onAuthStateChanged, signOut, type User } from "firebase/auth";
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { auth, OWNER_UID } from "./firebase";

type SessionState = {
  loading: boolean;
  user: User | null;
  isOwner: boolean;
  hasAuthConfig: boolean;
  skipAuth: boolean;
  logout: () => Promise<void>;
};

const SessionContext = createContext<SessionState | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const skipAuth = import.meta.env.VITE_SKIP_AUTH === "true";
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    if (skipAuth) {
      setLoading(false);
      setUser(null);
      return;
    }

    if (!auth) {
      setLoading(false);
      return;
    }

    return onAuthStateChanged(auth, (nextUser) => {
      setUser(nextUser);
      setLoading(false);
    });
  }, [skipAuth]);

  const value = useMemo<SessionState>(() => {
    const isOwner = skipAuth || Boolean(user && OWNER_UID && user.uid === OWNER_UID);
    return {
      loading,
      user,
      isOwner,
      hasAuthConfig: !skipAuth && Boolean(auth),
      skipAuth,
      logout: async () => {
        if (auth && !skipAuth) {
          await signOut(auth);
        }
      },
    };
  }, [loading, skipAuth, user]);

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const context = useContext(SessionContext);
  if (!context) {
    throw new Error("useSession must be used within SessionProvider");
  }
  return context;
}
