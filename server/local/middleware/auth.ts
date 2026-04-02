import { createMiddleware } from "hono/factory";
import { getDb } from "../db/index";
import { sessions, users, apiTokens } from "../db/schema/index";
import { eq } from "drizzle-orm";
import { createHash } from "node:crypto";
import type { User } from "../db/schema/users";

export interface AuthVariables {
  user: User;
  userId: string;
}

export const requireAuth = createMiddleware<{ Variables: AuthVariables }>(async (c, next) => {
  const user = await resolveUser(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  c.set("user", user);
  c.set("userId", user.id);
  await next();
});

export const optionalAuth = createMiddleware<{ Variables: Partial<AuthVariables> }>(async (c, next) => {
  const user = await resolveUser(c);
  if (user) {
    c.set("user", user);
    c.set("userId", user.id);
  }
  await next();
});

async function resolveUser(c: { req: { header: (n: string) => string | undefined }; get: (k: string) => unknown }): Promise<User | null> {
  const db = getDb();

  const sessionToken = extractSessionToken(c.req.header("cookie"));
  if (sessionToken) {
    const user = await resolveUserFromSessionToken(sessionToken);
    if (user) return user;
  }

  const bearerToken = extractBearerToken(c.req.header("Authorization"));
  if (bearerToken) {
    const userFromSession = await resolveUserFromSessionToken(bearerToken);
    if (userFromSession) return userFromSession;

    const hash = sha256(bearerToken);
    const token = await db.query.apiTokens.findFirst({ where: eq(apiTokens.tokenHash, hash) });
    if (token) {
      const user = await db.query.users.findFirst({ where: eq(users.id, token.userId) });
      if (user) return user;
    }
  }

  return null;
}

async function resolveUserFromSessionToken(sessionToken: string): Promise<User | null> {
  const db = getDb();
  const session = await db.query.sessions.findFirst({ where: eq(sessions.token, sessionToken) });
  if (!session || new Date(session.expiresAt) <= new Date()) {
    return null;
  }
  return (await db.query.users.findFirst({ where: eq(users.id, session.userId) })) ?? null;
}

function extractSessionToken(cookieHeader: string | undefined): string | null {
  if (!cookieHeader) return null;
  const match = cookieHeader.match(/session=([^;]+)/);
  return match?.[1] ?? null;
}

function extractBearerToken(authHeader: string | undefined): string | null {
  if (!authHeader) return null;
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  return match?.[1] ?? null;
}

function sha256(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}
