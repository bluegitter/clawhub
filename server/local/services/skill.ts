import { eq, desc, and } from "drizzle-orm";
import { getDb } from "../db/index";
import { skills, skillVersions, skillFiles, users } from "../db/schema/index";
import { storeFile } from "../storage/index";
import { generateEmbedding, storeEmbedding } from "./search";
import type { User } from "../db/schema/users";

export async function listSkills(cursor: string | null, limit: number) {
  const db = getDb();
  const rows = await db
    .select({
      id: skills.id,
      slug: skills.slug,
      displayName: skills.name,
      summary: skills.summary,
      latestVersion: skills.latestVersion,
      tags: skills.tags,
      createdAt: skills.createdAt,
      updatedAt: skills.updatedAt,
    })
    .from(skills)
    .where(eq(skills.visibility, "public"))
    .orderBy(desc(skills.updatedAt))
    .limit(Math.max(limit, 1));

  const startIndex = decodeCursor(cursor);
  const page = rows.slice(startIndex, startIndex + limit);
  const nextCursor = startIndex + limit < rows.length ? String(startIndex + limit) : null;

  return {
    items: page.map((row) => ({
      slug: row.slug,
      displayName: row.displayName,
      summary: row.summary,
      tags: toTagMap(row.tags, row.latestVersion),
      stats: {},
      createdAt: row.createdAt.getTime(),
      updatedAt: row.updatedAt.getTime(),
      latestVersion: row.latestVersion
        ? {
            version: row.latestVersion,
            createdAt: row.updatedAt.getTime(),
            changelog: "",
            license: null,
          }
        : undefined,
    })),
    nextCursor,
  };
}

export async function getSkillBySlug(slug: string) {
  const db = getDb();
  const skill = await db.query.skills.findFirst({ where: eq(skills.slug, slug) });
  if (!skill) return null;
  const owner = await db.query.users.findFirst({ where: eq(users.id, skill.ownerId) });

  const versions = await db
    .select({
      id: skillVersions.id,
      version: skillVersions.version,
      changelog: skillVersions.changelog,
      fileCount: skillVersions.fileCount,
      fileSize: skillVersions.fileSize,
      createdAt: skillVersions.createdAt,
    })
    .from(skillVersions)
    .where(eq(skillVersions.skillId, skill.id))
    .orderBy(desc(skillVersions.createdAt));

  const latestVersion = versions[0] ?? null;

  return {
    skill: {
      slug: skill.slug,
      displayName: skill.name,
      summary: skill.summary,
      tags: toTagMap(skill.tags, skill.latestVersion),
      stats: {},
      createdAt: skill.createdAt.getTime(),
      updatedAt: skill.updatedAt.getTime(),
    },
    latestVersion: latestVersion
      ? {
          version: latestVersion.version,
          createdAt: latestVersion.createdAt.getTime(),
          changelog: latestVersion.changelog ?? "",
          license: null,
        }
      : null,
    owner: owner
      ? {
          handle: owner.username,
          displayName: owner.realName,
          image: owner.image,
        }
      : null,
    moderation: null,
  };
}

export async function getVersionDetail(slug: string, version: string) {
  const db = getDb();
  const skill = await db.query.skills.findFirst({ where: eq(skills.slug, slug) });
  if (!skill) return null;

  const versionRow = await db.query.skillVersions.findFirst({
    where: and(eq(skillVersions.skillId, skill.id), eq(skillVersions.version, version)),
  });
  if (!versionRow) return null;

  const versionFiles = await db
    .select({ filename: skillFiles.filename, sha256: skillFiles.sha256, size: skillFiles.size })
    .from(skillFiles)
    .where(eq(skillFiles.versionId, versionRow.id));

  return {
    version: {
      version: versionRow.version,
      createdAt: versionRow.createdAt.getTime(),
      changelog: versionRow.changelog ?? "",
      changelogSource: null,
      license: null,
      files: versionFiles.map((file) => ({
        path: file.filename,
        size: file.size ?? 0,
        sha256: file.sha256 ?? null,
        contentType: "text/plain; charset=utf-8",
      })),
    },
    skill: {
      slug: skill.slug,
      displayName: skill.name,
    },
  };
}

export async function listSkillVersions(slug: string, cursor: string | null, limit: number) {
  const db = getDb();
  const skill = await db.query.skills.findFirst({ where: eq(skills.slug, slug) });
  if (!skill) return null;

  const rows = await db
    .select({
      version: skillVersions.version,
      createdAt: skillVersions.createdAt,
      changelog: skillVersions.changelog,
    })
    .from(skillVersions)
    .where(eq(skillVersions.skillId, skill.id))
    .orderBy(desc(skillVersions.createdAt));

  const startIndex = decodeCursor(cursor);
  const page = rows.slice(startIndex, startIndex + limit);
  const nextCursor = startIndex + limit < rows.length ? String(startIndex + limit) : null;

  return {
    items: page.map((row) => ({
      version: row.version,
      createdAt: row.createdAt.getTime(),
      changelog: row.changelog ?? "",
      changelogSource: null,
    })),
    nextCursor,
  };
}

export async function resolveSkillVersion(slug: string) {
  const db = getDb();
  const skill = await db.query.skills.findFirst({
    where: and(eq(skills.slug, slug), eq(skills.visibility, "public")),
  });
  if (!skill?.latestVersion) {
    return { match: null, latestVersion: null };
  }
  return {
    match: null,
    latestVersion: { version: skill.latestVersion },
  };
}

export async function getFileForVersion(
  slug: string,
  version: string,
  filename: string,
) {
  const db = getDb();
  const skill = await db.query.skills.findFirst({ where: eq(skills.slug, slug) });
  if (!skill) return null;
  const versionRow = await db.query.skillVersions.findFirst({
    where: and(eq(skillVersions.skillId, skill.id), eq(skillVersions.version, version)),
  });
  if (!versionRow) return null;

  const file = await db.query.skillFiles.findFirst({
    where: and(eq(skillFiles.versionId, versionRow.id), eq(skillFiles.filename, filename)),
  });
  if (!file) return null;

  return { storagePath: file.storagePath, filename: file.filename };
}

export async function checkSlugAvailability(slug: string): Promise<boolean> {
  const db = getDb();
  const existing = await db.query.skills.findFirst({ where: eq(skills.slug, slug) });
  return !existing;
}

export async function publishSkill(
  user: User,
  payload: {
    slug: string;
    name?: string;
    displayName?: string;
    version: string;
    changelog?: string;
    tags?: string[];
  },
  files: Array<{ filename: string; data: Buffer }>,
) {
  const db = getDb();
  const displayName = payload.displayName?.trim() || payload.name?.trim() || payload.slug;

  let skill = await db.query.skills.findFirst({ where: eq(skills.slug, payload.slug) });

  if (skill && skill.ownerId !== user.id) {
    throw new Error("Slug already owned by another user");
  }

  const stored: Array<{ filename: string; storagePath: string; sha256: string; size: number }> = [];
  let totalSize = 0;

  for (const file of files) {
    const result = await storeFile(payload.slug, payload.version, file.filename, file.data);
    stored.push({ filename: file.filename, ...result });
    totalSize += result.size;
  }

  if (!skill) {
    const inserted = await db
      .insert(skills)
      .values({
        slug: payload.slug,
        ownerId: user.id,
        name: displayName,
        summary: "",
        latestVersion: payload.version,
        tags: payload.tags ?? [],
        updatedAt: new Date(),
      })
      .returning();
    skill = inserted[0];
  } else {
    await db
      .update(skills)
      .set({ latestVersion: payload.version, updatedAt: new Date() })
      .where(eq(skills.id, skill.id));
  }

  const versionInserted = await db
    .insert(skillVersions)
    .values({
      skillId: skill.id,
      version: payload.version,
      changelog: payload.changelog ?? "",
      fileSize: totalSize,
      fileCount: files.length,
      storagePath: `${payload.slug}/${payload.version}`,
    })
    .returning();
  const versionRow = versionInserted[0];

  for (const sf of stored) {
    await db.insert(skillFiles).values({
      versionId: versionRow.id,
      filename: sf.filename,
      storagePath: sf.storagePath,
      sha256: sf.sha256,
      size: sf.size,
    });
  }

  generateEmbeddingForSkill(skill.id, files).catch((err) =>
    console.error("Background embedding generation failed:", err),
  );

  return {
    ok: true as const,
    skillId: skill.id,
    versionId: versionRow.id,
  };
}

async function generateEmbeddingForSkill(
  skillId: string,
  files: Array<{ filename: string; data: Buffer }>,
) {
  const skillMd = files.find((f) => f.filename.toLowerCase() === "skill.md");
  const text = skillMd
    ? skillMd.data.toString("utf-8")
    : files.map((f) => f.data.toString("utf-8")).join("\n");

  const embedding = await generateEmbedding(text);
  if (embedding) {
    await storeEmbedding(skillId, embedding);
  }
}

function toTagMap(tags: string[] | null | undefined, latestVersion: string | null | undefined) {
  if (!latestVersion) return {};
  const normalized = Array.isArray(tags) ? tags : [];
  const entries = normalized.length > 0 ? normalized : ["latest"];
  return Object.fromEntries(entries.map((tag) => [tag, latestVersion]));
}

function decodeCursor(cursor: string | null) {
  const parsed = Number.parseInt(cursor ?? "0", 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}
