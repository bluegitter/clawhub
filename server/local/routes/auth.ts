import { Hono, type Context } from "hono";
import { getDb } from "../db/index";
import { users, sessions, apiTokens } from "../db/schema/index";
import {
  SSO_BASE_URL,
  SSO_LOGIN_URL,
  SSO_LOGOUT_URL,
  SSO_APP_KEY,
  SSO_APP_SECRET,
  SSO_ENABLED,
  APP_URL,
  SESSION_MAX_AGE_MS,
  LOCAL_AUTH_ENABLED,
} from "../db/env";
import { requireAuth } from "../middleware/auth";
import { and, desc, eq } from "drizzle-orm";
import { createHash, randomBytes } from "node:crypto";

const app = new Hono();

interface SsoValidateResponse {
  code: number;
  message: string;
  data: {
    username: string;
    realName: string;
    email: string | null;
    phone: string | null;
  } | null;
}

async function createSessionForUser(params: {
  username: string;
  realName?: string | null;
  email?: string | null;
  phone?: string | null;
}) {
  const db = getDb();

  let user = await db.query.users.findFirst({ where: eq(users.username, params.username) });
  if (!user) {
    const inserted = await db
      .insert(users)
      .values({
        username: params.username,
        realName: params.realName ?? params.username,
        email: params.email ?? null,
        phone: params.phone ?? null,
      })
      .returning();
    user = inserted[0];
  } else {
    await db
      .update(users)
      .set({
        realName: params.realName ?? user.realName,
        email: params.email ?? user.email,
        phone: params.phone ?? user.phone,
        updatedAt: new Date(),
      })
      .where(eq(users.id, user.id));
  }

  const sessionToken = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + SESSION_MAX_AGE_MS);
  await db.insert(sessions).values({ userId: user.id, token: sessionToken, expiresAt });

  return {
    user,
    sessionToken,
    expiresAt,
  };
}

function buildSessionCookie(sessionToken: string) {
  return `session=${sessionToken}; HttpOnly; Path=/; Max-Age=${Math.floor(SESSION_MAX_AGE_MS / 1000)}; SameSite=Lax`;
}

function buildExpiredSessionCookie() {
  return "session=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax";
}

function withSessionTokenRedirect(target: string, sessionToken: string) {
  const url = new URL(target);
  url.searchParams.set("local_session", sessionToken);
  return url.toString();
}

function resolveSafeRedirect(input: string | null | undefined, fallback: string, requestUrl?: string) {
  const candidates = [fallback];
  if (requestUrl) {
    try {
      candidates.push(new URL("/", requestUrl).toString());
    } catch {
      // ignore invalid request URL
    }
  }

  if (!input) return candidates[0] ?? fallback;

  try {
    const url = new URL(input);
    const allowedHosts = new Set<string>();
    for (const candidate of candidates) {
      try {
        allowedHosts.add(new URL(candidate).host);
      } catch {
        // ignore invalid candidate
      }
    }
    if (["localhost", "127.0.0.1"].includes(url.hostname) || allowedHosts.has(url.host)) {
      return url.toString();
    }
  } catch {
    // ignore invalid redirect URL
  }

  return candidates[0] ?? fallback;
}

app.get("/login", async (c) => {
  const redirectUri = resolveSafeRedirect(c.req.query("redirect_uri"), APP_URL, c.req.url);

  if (SSO_ENABLED && SSO_LOGIN_URL) {
    return c.redirect(SSO_LOGIN_URL, 302);
  }

  if (!LOCAL_AUTH_ENABLED) {
    return c.json({ error: "No login provider configured" }, 404);
  }

  const username =
    c.req.query("username")?.trim().toLowerCase().replace(/[^a-z0-9_-]/g, "") || "localdev";
  const realName = c.req.query("name")?.trim() || "Local Dev";

  const result = await createSessionForUser({
    username,
    realName,
    email: `${username}@local.test`,
  });

  c.header("Set-Cookie", buildSessionCookie(result.sessionToken));
  return c.redirect(withSessionTokenRedirect(redirectUri, result.sessionToken), 302);
});

app.get("/dev-login", async (c) => {
  if (!LOCAL_AUTH_ENABLED) {
    return c.json({ error: "Local auth disabled" }, 404);
  }

  const username =
    c.req.query("username")?.trim().toLowerCase().replace(/[^a-z0-9_-]/g, "") || "localdev";
  const realName = c.req.query("name")?.trim() || "Local Dev";
  const target = resolveSafeRedirect(c.req.query("redirect_uri"), APP_URL, c.req.url);

  const result = await createSessionForUser({
    username,
    realName,
    email: `${username}@local.test`,
  });

  c.header("Set-Cookie", buildSessionCookie(result.sessionToken));
  return c.redirect(withSessionTokenRedirect(target, result.sessionToken), 302);
});

app.get("/sso/callback", async (c) => {
  const ssoToken = c.req.query("sso_token");
  if (!ssoToken) return c.redirect("/?error=no_token");
  if (!SSO_APP_SECRET) {
    return c.redirect("/?error=sso_secret_missing");
  }

  const validateUrl = new URL("/api/sso/validate", SSO_BASE_URL);
  validateUrl.searchParams.set("token", ssoToken);
  validateUrl.searchParams.set("appKey", SSO_APP_KEY);
  validateUrl.searchParams.set("appSecret", SSO_APP_SECRET);

  try {
    const res = await fetch(validateUrl.toString(), { method: "POST" });
    const result = (await res.json()) as SsoValidateResponse;

    if (result.code !== 200 || !result.data) {
      return c.redirect(`/?error=sso_failed&msg=${encodeURIComponent(result.message)}`);
    }

    const session = await createSessionForUser({
      username: result.data.username,
      realName: result.data.realName,
      email: result.data.email,
      phone: result.data.phone,
    });

    c.header("Set-Cookie", buildSessionCookie(session.sessionToken));
    return c.redirect(
      withSessionTokenRedirect(
        resolveSafeRedirect(c.req.query("redirect_uri"), new URL("/", APP_URL).toString(), c.req.url),
        session.sessionToken,
      ),
      302,
    );
  } catch (err) {
    console.error("SSO callback error:", err);
    return c.redirect("/?error=sso_error");
  }
});

async function clearLocalSession(c: Context) {
  const cookie = c.req.header("cookie") ?? "";
  const cookieMatch = cookie.match(/session=([^;]+)/);
  const authHeader = c.req.header("Authorization");
  const bearerMatch = authHeader?.match(/^Bearer\s+(.+)$/i);
  const sessionToken = cookieMatch?.[1] ?? bearerMatch?.[1];
  if (sessionToken) {
    const db = getDb();
    await db.delete(sessions).where(eq(sessions.token, sessionToken));
  }
  c.header("Set-Cookie", buildExpiredSessionCookie());
}

app.get("/logout", async (c) => {
  await clearLocalSession(c);
  if (SSO_ENABLED && SSO_LOGOUT_URL) {
    return c.redirect(SSO_LOGOUT_URL, 302);
  }
  return c.redirect(resolveSafeRedirect(c.req.query("redirect_uri"), APP_URL, c.req.url), 302);
});

app.post("/logout", async (c) => {
  await clearLocalSession(c);
  return c.json({ ok: true });
});

app.get("/me", requireAuth, async (c) => {
  const user = c.get("user");
  return c.json({
    user: {
      id: user.id,
      username: user.username,
      realName: user.realName,
      email: user.email,
      phone: user.phone,
      image: user.image,
    },
  });
});

app.get("/tokens", requireAuth, async (c) => {
  const userId = c.get("userId");
  const db = getDb();
  const rows = await db.query.apiTokens.findMany({
    where: eq(apiTokens.userId, userId),
    orderBy: [desc(apiTokens.createdAt)],
  });

  return c.json({
    tokens: rows.map((row) => ({
      id: row.id,
      label: row.name ?? "API token",
      prefix: row.tokenPrefix,
      createdAt: row.createdAt.getTime(),
    })),
  });
});

app.post("/tokens", requireAuth, async (c) => {
  const userId = c.get("userId");
  const payload = (await c.req.json().catch(() => ({}))) as { label?: string };
  const rawToken = randomBytes(24).toString("hex");
  const tokenHash = createHash("sha256").update(rawToken).digest("hex");
  const tokenPrefix = rawToken.slice(0, 8);
  const label = payload.label?.trim() || "CLI token";

  const db = getDb();
  const inserted = await db
    .insert(apiTokens)
    .values({
      userId,
      tokenHash,
      tokenPrefix,
      name: label,
    })
    .returning();

  const token = inserted[0];
  return c.json({
    token: rawToken,
    meta: {
      id: token?.id ?? null,
      label,
      prefix: tokenPrefix,
      createdAt: Date.now(),
    },
  });
});

app.delete("/tokens/:id", requireAuth, async (c) => {
  const userId = c.get("userId");
  const id = c.req.param("id");
  const db = getDb();
  await db.delete(apiTokens).where(and(eq(apiTokens.id, id), eq(apiTokens.userId, userId)));
  return c.json({ ok: true });
});

export default app;
