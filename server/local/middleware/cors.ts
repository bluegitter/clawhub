import { createMiddleware } from "hono/factory";

function resolveAllowedOrigin(origin: string | null) {
  if (!origin) return null;
  try {
    const url = new URL(origin);
    if (
      ["localhost", "127.0.0.1", "192.168.20.4"].includes(url.hostname) &&
      ["3000", "3001"].includes(url.port)
    ) {
      return origin;
    }
  } catch {
    // ignore invalid origin
  }
  return null;
}

export const cors = createMiddleware(async (c, next) => {
  await next();
  const allowedOrigin = resolveAllowedOrigin(c.req.header("origin") ?? null);
  c.res.headers.set("Access-Control-Allow-Origin", allowedOrigin ?? "*");
  c.res.headers.set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  c.res.headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
  c.res.headers.set("Access-Control-Max-Age", "86400");
  if (allowedOrigin) {
    c.res.headers.set("Access-Control-Allow-Credentials", "true");
    c.res.headers.set("Vary", "Origin");
  }
});

export const corsPreflight = createMiddleware(async (c) => {
  const allowedOrigin = resolveAllowedOrigin(c.req.header("origin") ?? null);
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": allowedOrigin ?? "*",
      "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Access-Control-Max-Age": "86400",
      ...(allowedOrigin
        ? {
            "Access-Control-Allow-Credentials": "true",
            Vary: "Origin",
          }
        : {}),
    },
  });
});
