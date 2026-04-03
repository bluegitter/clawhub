import { useEffect, useState } from "react";
import type { Doc } from "../../convex/_generated/dataModel";
import {
  fetchLocalWhoAmI,
  getLocalSessionToken,
  type LocalAuthUser,
} from "./localBackend";

export function useAuthStatus() {
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
  }, [localSessionVersion]);

  return {
    me: localMe as Doc<"users"> | null | undefined,
    isLoading: localMe === undefined,
    isAuthenticated: Boolean(localMe),
  };
}
