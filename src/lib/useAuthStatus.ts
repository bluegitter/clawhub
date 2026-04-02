import { useConvexAuth, useQuery } from "convex/react";
import { useEffect, useState } from "react";
import { api } from "../../convex/_generated/api";
import type { Doc } from "../../convex/_generated/dataModel";
import {
  fetchLocalWhoAmI,
  getLocalSessionToken,
  shouldUseLocalBackend,
  type LocalAuthUser,
} from "./localBackend";

export function useAuthStatus() {
  const useLocalBackend = shouldUseLocalBackend();
  const auth = useConvexAuth();
  const me = useQuery(api.users.me, useLocalBackend ? "skip" : {}) as Doc<"users"> | null | undefined;
  const [localMe, setLocalMe] = useState<LocalAuthUser | null | undefined>(undefined);
  const [localSessionVersion, setLocalSessionVersion] = useState(0);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const onSessionChanged = () => setLocalSessionVersion((value) => value + 1);
    window.addEventListener("clawhub:local-session-changed", onSessionChanged);
    window.addEventListener("storage", onSessionChanged);
    return () => {
      window.removeEventListener("clawhub:local-session-changed", onSessionChanged);
      window.removeEventListener("storage", onSessionChanged);
    };
  }, []);

  useEffect(() => {
    if (!useLocalBackend) return;
    if (!getLocalSessionToken()) {
      setLocalMe(null);
      return;
    }
    let cancelled = false;
    void fetchLocalWhoAmI()
      .then((user) => {
        if (!cancelled) setLocalMe(user);
      })
      .catch(() => {
        if (!cancelled) setLocalMe(null);
      });
    return () => {
      cancelled = true;
    };
  }, [localSessionVersion, useLocalBackend]);

  if (useLocalBackend) {
    return {
      me: localMe,
      isLoading: localMe === undefined,
      isAuthenticated: Boolean(localMe),
    };
  }

  return {
    me,
    isLoading: auth.isLoading,
    isAuthenticated: auth.isAuthenticated,
  };
}
