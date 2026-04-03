import { createMiddleware } from "hono/factory";
import { CORS_ALLOWED_ORIGINS } from "../db/env";

function resolveAllowedOrigin(origin: string | null) {
  if (!origin) return null;
  return CORS_ALLOWED_ORIGINS.includes(origin) ? origin : null;
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
