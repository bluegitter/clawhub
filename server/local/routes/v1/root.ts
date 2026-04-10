import { Hono } from "hono";
import { createHash } from "node:crypto";
import { requireAuth, optionalAuth } from "../../middleware/auth";
import { getDb } from "../../db/index";
import { skillLabels, skills, stars, users } from "../../db/schema/index";
import { searchSkills } from "../../services/search";
import {
  getSkillStatsMap,
  getVersionArchive,
  recordSkillDownload,
  resolveSkillVersion,
} from "../../services/skill";
import { buildDeterministicZip } from "../../services/zipBuilder";
import type { AuthVariables } from "../../middleware/auth";
import { and, desc, eq, sql } from "drizzle-orm";

const app = new Hono<{ Variables: AuthVariables }>();

function toResponseBody(data: Uint8Array | Buffer) {
  return Uint8Array.from(data);
}

function resolveDownloadIdentity(c: {
  get: (key: "userId") => string | undefined;
  req: { header: (name: string) => string | undefined };
}) {
  const userId = c.get("userId");
  if (userId) return `user:${userId}`;

  const forwardedFor = c.req.header("x-forwarded-for");
  const realIp = c.req.header("x-real-ip");
  const connectingIp = c.req.header("cf-connecting-ip");
  const rawIp = forwardedFor?.split(",")[0]?.trim() || realIp?.trim() || connectingIp?.trim();
  if (rawIp) {
    const hashedIp = createHash("sha256").update(rawIp).digest("hex");
    return `ip:${hashedIp}`;
  }

  return "anonymous";
}

app.get("/search", optionalAuth, async (c) => {
  const query = c.req.query("q") ?? "";
  const limit = Math.min(parseInt(c.req.query("limit") ?? "20"), 100);
  const label = c.req.query("label")?.trim() ?? null;
  const results = await searchSkills(query, limit, { label });
  const statsBySkillId = await getSkillStatsMap(results.map((entry) => entry.id));
  return c.json({
    results: results.map((entry) => ({
      id: entry.id,
      slug: entry.slug,
      displayName: entry.name,
      summary: entry.summary,
      version: entry.latestVersion,
      tags: {},
      labels: entry.labels ?? [],
      stats: statsBySkillId.get(entry.id) ?? {
        stars: 0,
        downloads: 0,
        installsCurrent: 0,
        installsAllTime: 0,
        versions: 0,
      },
      owner: {
        handle: entry.ownerHandle ?? null,
        displayName: entry.ownerDisplayName ?? null,
        image: entry.ownerImage ?? null,
      },
      score: "score" in entry && typeof entry.score === "number" ? entry.score : 1,
      updatedAt: entry.updatedAt?.getTime(),
    })),
  });
});

app.get("/whoami", requireAuth, async (c) => {
  const user = c.get("user");
  return c.json({
    user: {
      handle: user.username,
      displayName: user.realName,
      image: user.image,
    },
  });
});

app.get("/resolve", optionalAuth, async (c) => {
  const slug = c.req.query("slug")?.trim();
  if (!slug) return c.json({ error: "slug is required" }, 400);
  const result = await resolveSkillVersion(slug);
  return c.json(result);
});

app.get("/download", optionalAuth, async (c) => {
  const slug = c.req.query("slug")?.trim();
  const version = c.req.query("version")?.trim();
  if (!slug) return c.json({ error: "slug is required" }, 400);
  if (!version) return c.json({ error: "version is required" }, 400);

  try {
    const archive = await getVersionArchive(slug, version);
    if (!archive || archive.files.length === 0) return c.json({ error: "No files" }, 404);
    await recordSkillDownload({
      skillId: archive.skillId,
      versionId: archive.versionId,
      identityKey: resolveDownloadIdentity(c),
    });
    const zip = buildDeterministicZip(
      archive.files.map((f) => ({ name: f.filename, data: new Uint8Array(f.data) })),
    );
    return new Response(toResponseBody(zip), {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${archive.slug}-${version}.zip"`,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Download failed";
    return c.json({ error: message }, 500);
  }
});

app.get("/stars", requireAuth, async (c) => {
  const userId = c.get("userId");
  const db = getDb();
  const rows = await db
    .select({
      starId: stars.id,
      createdAt: stars.createdAt,
      skillId: skills.id,
      slug: skills.slug,
      displayName: skills.name,
      summary: skills.summary,
      latestVersion: skills.latestVersion,
      updatedAt: skills.updatedAt,
      labels: sql<string[]>`coalesce(array_agg(distinct ${skillLabels.label}) filter (where ${skillLabels.label} is not null), ARRAY[]::text[])`,
      ownerId: users.id,
      ownerHandle: users.username,
      ownerDisplayName: users.realName,
      ownerImage: users.image,
    })
    .from(stars)
    .innerJoin(skills, eq(stars.skillId, skills.id))
    .innerJoin(users, eq(skills.ownerId, users.id))
    .leftJoin(skillLabels, eq(skillLabels.skillId, skills.id))
    .where(and(eq(stars.userId, userId), eq(skills.visibility, "public")))
    .groupBy(
      stars.id,
      stars.createdAt,
      skills.id,
      skills.slug,
      skills.name,
      skills.summary,
      skills.latestVersion,
      skills.updatedAt,
      users.id,
      users.username,
      users.realName,
      users.image,
    )
    .orderBy(desc(stars.createdAt));
  const statsBySkillId = await getSkillStatsMap(rows.map((row) => row.skillId));

  return c.json({
    items: rows.map((row) => ({
      starredAt: row.createdAt.getTime(),
      skill: {
        id: row.skillId,
        slug: row.slug,
        displayName: row.displayName,
        summary: row.summary,
        latestVersion: row.latestVersion,
        tags: {},
        labels: row.labels ?? [],
        stats: statsBySkillId.get(row.skillId) ?? {
          stars: 0,
          downloads: 0,
          installsCurrent: 0,
          installsAllTime: 0,
          versions: 0,
        },
        updatedAt: row.updatedAt.getTime(),
      },
      owner: {
        id: row.ownerId,
        handle: row.ownerHandle,
        displayName: row.ownerDisplayName,
        image: row.ownerImage,
      },
    })),
  });
});

app.get("/stars/:slug/status", requireAuth, async (c) => {
  const userId = c.get("userId");
  const slug = c.req.param("slug");
  const db = getDb();
  const skill = await db.query.skills.findFirst({ where: eq(skills.slug, slug) });
  if (!skill) return c.json({ starred: false });
  const star = await db.query.stars.findFirst({
    where: and(eq(stars.userId, userId), eq(stars.skillId, skill.id)),
  });
  return c.json({ starred: Boolean(star) });
});

app.post("/stars/:slug/toggle", requireAuth, async (c) => {
  const userId = c.get("userId");
  const slug = c.req.param("slug");
  const db = getDb();
  const skill = await db.query.skills.findFirst({ where: eq(skills.slug, slug) });
  if (!skill) return c.json({ error: "Skill not found" }, 404);

  const existing = await db.query.stars.findFirst({
    where: and(eq(stars.userId, userId), eq(stars.skillId, skill.id)),
  });

  if (existing) {
    await db.delete(stars).where(eq(stars.id, existing.id));
    return c.json({ starred: false });
  }

  await db.insert(stars).values({ userId, skillId: skill.id });
  return c.json({ starred: true });
});

export default app;
