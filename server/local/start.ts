import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { startDatabase, stopDatabase } from "./db/index";
import { APP_URL, SSO_BASE_URL } from "./db/env";
import { cors, corsPreflight } from "./middleware/cors";
import authRoutes from "./routes/auth";
import rootV1Routes from "./routes/v1/root";
import skillsRoutes from "./routes/v1/skills";

const app = new Hono();

app.use("*", cors);
app.options("/*", corsPreflight);

app.route("/auth", authRoutes);
app.route("/api/v1", rootV1Routes);
app.route("/api/v1/skills", skillsRoutes);

app.get("/login", (c) => {
  const redirectUri = new URL("/", c.req.url).toString();
  const loginUrl = new URL("/auth/login", c.req.url);
  loginUrl.searchParams.set("redirect_uri", redirectUri);

  return c.html(`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Local Login</title>
    <style>
      body { font-family: ui-sans-serif, system-ui, sans-serif; padding: 40px; line-height: 1.5; }
      main { max-width: 640px; margin: 0 auto; }
      a { color: #0f766e; text-decoration: none; }
      a:hover { text-decoration: underline; }
      .btn { display: inline-block; margin-top: 16px; padding: 10px 16px; border-radius: 10px; background: #0f766e; color: white; }
    </style>
  </head>
  <body>
    <main>
      <h1>Login</h1>
      <p>This local deployment uses the backend auth gateway. It may redirect to unified SSO or local development login depending on server configuration.</p>
      <a class="btn" href="${loginUrl.toString()}">Sign in</a>
    </main>
  </body>
</html>`);
});

app.get("/", (c) => {
  const ssoToken = c.req.query("sso_token")?.trim();
  if (ssoToken) {
    const callbackUrl = new URL("/auth/sso/callback", new URL(c.req.url).origin);
    callbackUrl.searchParams.set("sso_token", ssoToken);
    callbackUrl.searchParams.set("redirect_uri", APP_URL);
    return c.redirect(callbackUrl.toString(), 302);
  }

  return c.html(`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>ClawHub Local API</title>
    <style>
      body { font-family: ui-sans-serif, system-ui, sans-serif; padding: 40px; line-height: 1.5; }
      main { max-width: 720px; margin: 0 auto; }
      code { background: #f3f4f6; padding: 2px 6px; border-radius: 6px; }
      a { color: #0f766e; text-decoration: none; }
      a:hover { text-decoration: underline; }
    </style>
  </head>
  <body>
    <main>
      <h1>ClawHub local backend is running</h1>
      <p>This server on <code>${new URL(c.req.url).origin}</code> is the local API, not the frontend app.</p>
      <p>Useful endpoints:</p>
      <ul>
        <li><a href="/health">/health</a></li>
        <li><a href="/.well-known/clawhub.json">/.well-known/clawhub.json</a></li>
        <li><a href="/api/v1/skills">/api/v1/skills</a></li>
        <li><a href="/auth/me">/auth/me</a> (requires login)</li>
      </ul>
      <p>The UI on port 3000 has not been migrated off Convex auth yet, so it will not use this local login flow by itself.</p>
      <p>Configured app URL: <code>${APP_URL}</code></p>
      <p>Configured SSO base: <code>${SSO_BASE_URL}</code></p>
    </main>
  </body>
</html>`);
});

app.get("/.well-known/clawhub.json", (c) =>
  c.json({
    apiBase: new URL(c.req.url).origin,
    authBase: new URL(c.req.url).origin,
  }),
);

app.get("/health", (c) => c.json({ status: "ok" }));

const PORT = parseInt(process.env.PORT ?? "3001");

async function main() {
  console.log("Starting database...");
  await startDatabase();
  console.log("Database ready.");

  console.log(`Starting server on port ${PORT}...`);
  if (process.versions.bun) {
    const bunRuntime = globalThis as typeof globalThis & {
      Bun?: { serve: (options: { port: number; fetch: typeof app.fetch }) => unknown };
    };
    bunRuntime.Bun?.serve({
      port: PORT,
      fetch: app.fetch,
    });
    console.log(`Server running at http://localhost:${PORT}`);
    return;
  }

  serve({ fetch: app.fetch, port: PORT }, (info) => {
    console.log(`Server running at http://localhost:${info.port}`);
  });
}

const shutdown = async () => {
  console.log("\nShutting down...");
  await stopDatabase();
  process.exit(0);
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});

export default app;
