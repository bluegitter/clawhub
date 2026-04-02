import { useMutation } from "convex/react";
import { useEffect, useRef } from "react";
import { api } from "../../convex/_generated/api";
import { shouldUseLocalBackend } from "../lib/localBackend";
import { useAuthStatus } from "../lib/useAuthStatus";

export function UserBootstrap() {
  const { isAuthenticated, isLoading } = useAuthStatus();
  const ensureUser = useMutation(api.users.ensure);
  const didRun = useRef(false);
  const useLocalBackend = shouldUseLocalBackend();

  useEffect(() => {
    if (useLocalBackend) return;
    if (isLoading || !isAuthenticated || didRun.current) return;
    didRun.current = true;
    void ensureUser();
  }, [ensureUser, isAuthenticated, isLoading, useLocalBackend]);

  return null;
}
