import { Hono } from "hono";
import { requireAuth, optionalAuth } from "../../middleware/auth";
import { getDb } from "../../db/index";
import { skills, stars, users } from "../../db/schema/index";
import { searchSkills } from "../../services/search";
import { getSkillStatsMap, getVersionArchive, resolveSkillVersion } from "../../services/skill";
import { buildDeterministicZip } from "../../services/zipBuilder";
import type { AuthVariables } from "../../middleware/auth";
import { and, desc, eq } from "drizzle-orm";

const app = new Hono<{ Variables: AuthVariables }>();

function toResponseBody(data: Uint8Array | Buffer) {
  return Uint8Array.from(data);
}

app.get("/search", optionalAuth, async (c) => {
  const query = c.req.query("q") ?? "";
  const limit = Math.min(parseInt(c.req.query("limit") ?? "20"), 100);
  const results = await searchSkills(query, limit);
  const statsBySkillId = await getSkillStatsMap(results.map((entry) => entry.id));
  return c.json({
    results: results.map((entry) => ({
      id: entry.id,
      slug: entry.slug,
      displayName: entry.name,
      summary: entry.summary,
      version: entry.latestVersion,
      tags: entry.tags ?? [],
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
      tags: skills.tags,
      updatedAt: skills.updatedAt,
      ownerId: users.id,
      ownerHandle: users.username,
      ownerDisplayName: users.realName,
      ownerImage: users.image,
    })
    .from(stars)
    .innerJoin(skills, eq(stars.skillId, skills.id))
    .innerJoin(users, eq(skills.ownerId, users.id))
    .where(and(eq(stars.userId, userId), eq(skills.visibility, "public")))
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
        tags: row.tags ?? [],
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
