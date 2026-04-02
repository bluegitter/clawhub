function readString(value: unknown) {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

function readProcessEnv(name: string) {
  if (typeof process === "undefined") return undefined;
  return readString(process.env?.[name]);
}

function readClientMetaEnv(name: string) {
  return readString((import.meta.env as Record<string, unknown> | undefined)?.[name]);
}

export function getRuntimeEnv(name: string) {
  return readProcessEnv(name) ?? readClientMetaEnv(name);
}

export function getRequiredRuntimeEnv(name: string) {
  const value = getRuntimeEnv(name);
  if (value) return value;
  throw new Error(`Missing required environment variable: ${name}`);
}

export function isDevRuntime() {
  const nodeEnv = readProcessEnv("NODE_ENV");
  if (nodeEnv) {
    return nodeEnv !== "production";
  }
  return Boolean(import.meta.env.DEV);
}

export function getLocalBackendOrigin() {
  const explicit = getRuntimeEnv("VITE_LOCAL_BACKEND_URL");
  if (explicit) return explicit;

  if (typeof window !== "undefined") {
    const { protocol, hostname } = window.location;
    if (hostname === "localhost" || hostname === "127.0.0.1") {
      return `${protocol}//${hostname}:3001`;
    }
  }

  const siteUrl = getRuntimeEnv("VITE_SITE_URL");
  if (siteUrl) {
    try {
      const url = new URL(siteUrl);
      if (url.hostname === "localhost" || url.hostname === "127.0.0.1") {
        return `${url.protocol}//${url.hostname}:3001`;
      }
    } catch {
      // ignore invalid URLs
    }
  }

  return null;
}

export function getAppOrigin() {
  const explicit = getRuntimeEnv("VITE_APP_URL") ?? getRuntimeEnv("APP_URL") ?? getRuntimeEnv("VITE_SITE_URL");
  if (explicit) return explicit;

  if (typeof window !== "undefined") {
    return window.location.origin;
  }

  return "http://localhost:3000";
}

export function shouldUseLocalLogin() {
  return Boolean(getLocalBackendOrigin());
}
