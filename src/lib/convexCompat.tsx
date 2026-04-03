import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { getLocalAuthLoginUrl, getLocalAuthLogoutUrl, getLocalSessionToken } from "./localBackend";

export function ConvexAuthProvider({ children }: { children: ReactNode }) {
  return <>{children}</>;
}

export function useAuthActions() {
  const signIn = useCallback(
    async (_provider?: string, params?: { code?: string; redirectTo?: string }) => {
      if (typeof window === "undefined") return { signingIn: false };
      if (params?.code) return { signingIn: false };
      window.location.assign(getLocalAuthLoginUrl(params?.redirectTo));
      return { signingIn: true };
    },
    [],
  );

  const signOut = useCallback(async () => {
    if (typeof window === "undefined") return;
    window.location.assign(getLocalAuthLogoutUrl(`${window.location.origin}/`));
  }, []);

  return { signIn, signOut };
}

export function useConvexAuth() {
  const [isAuthenticated, setIsAuthenticated] = useState(() => Boolean(getLocalSessionToken()));

  useEffect(() => {
    if (typeof window === "undefined") return;
    const sync = () => setIsAuthenticated(Boolean(getLocalSessionToken()));
    window.addEventListener("clawhub:local-session-changed", sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener("clawhub:local-session-changed", sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  return { isLoading: false, isAuthenticated };
}

export function useQuery(_reference: unknown, _args?: unknown): any {
  return undefined;
}

export function useQueries<T extends Record<string, unknown>>(queries: T): any {
  return useMemo(() => {
    const entries = Object.keys(queries).map((key) => [key, undefined]);
    return Object.fromEntries(entries);
  }, [queries]);
}

function createUnavailableFunction() {
  return async (..._args: any[]) => {
    throw new Error("This feature has not been migrated off Convex yet.");
  };
}

export function useMutation(_reference: unknown): any {
  return useMemo(() => createUnavailableFunction(), []);
}

export function useAction(_reference: unknown): any {
  return useMemo(() => createUnavailableFunction(), []);
}
