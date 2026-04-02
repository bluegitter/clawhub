import { ConvexAuthProvider, useAuthActions } from "@convex-dev/auth/react";
import { useEffect, useRef } from "react";
import { convex } from "../convex/client";
import { getUserFacingConvexError } from "../lib/convexError";
import { clearLocalSessionToken, setLocalSessionToken } from "../lib/localBackend";
import { getLocalBackendOrigin } from "../lib/runtimeEnv";
import { clearAuthError, setAuthError } from "../lib/useAuthError";
import { UserBootstrap } from "./UserBootstrap";

function getPendingAuthCode() {
  if (typeof window === "undefined") return null;
  const url = new URL(window.location.href);
  const code = url.searchParams.get("code");
  if (!code) return null;
  url.searchParams.delete("code");
  return {
    code,
    relativeUrl: `${url.pathname}${url.search}${url.hash}`,
  };
}

export function AuthCodeHandler() {
  const { signIn } = useAuthActions();
  const handledCodeRef = useRef<string | null>(null);
  const signInWithCode = signIn as (
    provider: string | undefined,
    params: { code: string },
  ) => Promise<{ signingIn: boolean }>;

  useEffect(() => {
    const pending = getPendingAuthCode();
    if (!pending) return;
    if (handledCodeRef.current === pending.code) return;
    handledCodeRef.current = pending.code;

    clearAuthError();
    window.history.replaceState(null, "", pending.relativeUrl);

    void signInWithCode(undefined, { code: pending.code })
      .then((result) => {
        if (result.signingIn === false) {
          setAuthError("Sign in failed. Please try again.");
        }
      })
      .catch((error) => {
        setAuthError(getUserFacingConvexError(error, "Sign in failed. Please try again."));
      });
  }, [signInWithCode]);

  return null;
}

function getPendingAuthError() {
  if (typeof window === "undefined") return null;
  const url = new URL(window.location.href);
  const description =
    url.searchParams.get("error_description")?.trim() || url.searchParams.get("error")?.trim();
  if (!description) return null;
  url.searchParams.delete("error");
  url.searchParams.delete("error_description");
  return {
    description,
    relativeUrl: `${url.pathname}${url.search}${url.hash}`,
  };
}

export function AuthErrorHandler() {
  const handledErrorRef = useRef<string | null>(null);
  useEffect(() => {
    const pending = getPendingAuthError();
    if (!pending) return;
    if (handledErrorRef.current === pending.description) return;
    handledErrorRef.current = pending.description;

    window.history.replaceState(null, "", pending.relativeUrl);
    setAuthError(pending.description);
  }, []);

  return null;
}

function getPendingLocalSsoToken() {
  if (typeof window === "undefined") return null;
  const backendOrigin = getLocalBackendOrigin();
  if (!backendOrigin) return null;

  const url = new URL(window.location.href);
  const token = url.searchParams.get("sso_token")?.trim();
  if (!token) return null;

  url.searchParams.delete("sso_token");
  const callbackUrl = new URL("/auth/sso/callback", backendOrigin);
  callbackUrl.searchParams.set("sso_token", token);
  callbackUrl.searchParams.set("redirect_uri", url.toString());

  return callbackUrl.toString();
}

export function LocalSsoTokenHandler() {
  const handledRef = useRef<string | null>(null);

  useEffect(() => {
    const callbackUrl = getPendingLocalSsoToken();
    if (!callbackUrl) return;
    if (handledRef.current === callbackUrl) return;
    handledRef.current = callbackUrl;
    window.location.replace(callbackUrl);
  }, []);

  return null;
}

function getPendingLocalSession() {
  if (typeof window === "undefined") return null;
  const url = new URL(window.location.href);
  const token = url.searchParams.get("local_session")?.trim();
  if (!token) return null;
  url.searchParams.delete("local_session");
  return {
    token,
    relativeUrl: `${url.pathname}${url.search}${url.hash}`,
  };
}

export function LocalSessionHandler() {
  const handledRef = useRef<string | null>(null);

  useEffect(() => {
    const pending = getPendingLocalSession();
    if (!pending) return;
    if (handledRef.current === pending.token) return;
    handledRef.current = pending.token;
    clearLocalSessionToken();
    setLocalSessionToken(pending.token);
    window.history.replaceState(null, "", pending.relativeUrl);
  }, []);

  return null;
}

export function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <ConvexAuthProvider client={convex} shouldHandleCode={false}>
      <LocalSsoTokenHandler />
      <LocalSessionHandler />
      <AuthCodeHandler />
      <AuthErrorHandler />
      <UserBootstrap />
      {children}
    </ConvexAuthProvider>
  );
}
