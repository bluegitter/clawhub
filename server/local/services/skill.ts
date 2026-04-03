import { eq, desc, and, inArray, sql } from "drizzle-orm";
import { getDb } from "../db/index";
import {
  skills,
  skillVersions,
  skillFiles,
  users,
  stars,
  skillEmbeddings,
  skillVersionTags,
  skillAliases,
} from "../db/schema/index";
import { deleteVersionDir, getFile, storeFile } from "../storage/index";
import { generateEmbedding, storeEmbedding } from "./search";
import type { User } from "../db/schema/users";

export async function listSkills(cursor: string | null, limit: number) {
  const db = getDb();
  const [rows, countRow] = await Promise.all([
    db
    .select({
      id: skills.id,
      slug: skills.slug,
      displayName: skills.name,
      summary: skills.summary,
      latestVersion: skills.latestVersion,
      tags: skills.tags,
      createdAt: skills.createdAt,
      updatedAt: skills.updatedAt,
      ownerHandle: users.username,
      ownerDisplayName: users.realName,
      ownerImage: users.image,
    })
    .from(skills)
    .innerJoin(users, eq(skills.ownerId, users.id))
    .where(eq(skills.visibility, "public"))
    .orderBy(desc(skills.updatedAt))
    .limit(Math.max(limit, 1)),
    db
      .select({ count: sql<number>`cast(count(*) as int)` })
      .from(skills)
      .where(eq(skills.visibility, "public")),
  ]);

  const statsBySkillId = await getSkillStatsMap(rows.map((row) => row.id));

  const startIndex = decodeCursor(cursor);
  const page = rows.slice(startIndex, startIndex + limit);
  const nextCursor = startIndex + limit < rows.length ? String(startIndex + limit) : null;

  return {
    items: page.map((row) => ({
      id: row.id,
      slug: row.slug,
      displayName: row.displayName,
      summary: row.summary,
      tags: toTagMap(row.tags, row.latestVersion),
      stats: statsBySkillId.get(row.id) ?? defaultSkillStats(),
      createdAt: row.createdAt.getTime(),
      updatedAt: row.updatedAt.getTime(),
      owner: {
        handle: row.ownerHandle,
        displayName: row.ownerDisplayName,
        image: row.ownerImage,
      },
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
    totalCount: Number(countRow[0]?.count ?? rows.length),
  };
}

export async function getSkillBySlug(slug: string) {
  const db = getDb();
  const resolved = await resolveSkillRecord(slug);
  if (!resolved) return null;
  const { skill, resolvedSlug, requestedSlug } = resolved;
  const owner = await db.query.users.findFirst({ where: eq(users.id, skill.ownerId) });
  const statsBySkillId = await getSkillStatsMap([skill.id]);
  const stats = statsBySkillId.get(skill.id) ?? defaultSkillStats();

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
  const tagMap = await loadSkillTagMap(skill.id);

  return {
    skill: {
      id: skill.id,
      slug: resolvedSlug,
      displayName: skill.name,
      summary: skill.summary,
      tags: Object.keys(tagMap).length > 0 ? tagMap : toTagMap(skill.tags, skill.latestVersion),
      stats,
      createdAt: skill.createdAt.getTime(),
      updatedAt: skill.updatedAt.getTime(),
    },
    latestVersion: latestVersion
      ? {
          version: latestVersion.version,
          createdAt: latestVersion.createdAt.getTime(),
          changelog: latestVersion.changelog ?? "",
          license: null,
          fileCount: latestVersion.fileCount ?? 0,
          fileSize: latestVersion.fileSize ?? 0,
        }
      : null,
    owner: owner
      ? {
          handle: owner.username,
          displayName: owner.realName,
          image: owner.image,
        }
      : null,
    requestedSlug,
    resolvedSlug,
    moderation: null,
  };
}

export async function getSkillStatsMap(skillIds: string[]) {
  const normalized = Array.from(new Set(skillIds.filter(Boolean)));
  const statsMap = new Map<string, ReturnType<typeof defaultSkillStats>>();
  if (normalized.length === 0) return statsMap;

  const db = getDb();
  const [starRows, versionRows] = await Promise.all([
    db
      .select({
        skillId: stars.skillId,
        count: sql<number>`cast(count(*) as int)`,
      })
      .from(stars)
      .where(inArray(stars.skillId, normalized))
      .groupBy(stars.skillId),
    db
      .select({
        skillId: skillVersions.skillId,
        count: sql<number>`cast(count(*) as int)`,
      })
      .from(skillVersions)
      .where(inArray(skillVersions.skillId, normalized))
      .groupBy(skillVersions.skillId),
  ]);

  for (const skillId of normalized) {
    statsMap.set(skillId, defaultSkillStats());
  }

  for (const row of starRows) {
    const current = statsMap.get(row.skillId) ?? defaultSkillStats();
    current.stars = Number(row.count ?? 0);
    statsMap.set(row.skillId, current);
  }

  for (const row of versionRows) {
    const current = statsMap.get(row.skillId) ?? defaultSkillStats();
    current.versions = Number(row.count ?? 0);
    statsMap.set(row.skillId, current);
  }

  return statsMap;
}

export async function getVersionDetail(slug: string, version: string) {
  const db = getDb();
  const resolved = await resolveSkillRecord(slug);
  if (!resolved) return null;
  const { skill, resolvedSlug, requestedSlug } = resolved;

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
      fileCount: versionRow.fileCount ?? versionFiles.length,
      fileSize: versionRow.fileSize ?? 0,
      files: versionFiles.map((file) => ({
        path: file.filename,
        size: file.size ?? 0,
        sha256: file.sha256 ?? null,
        contentType: "text/plain; charset=utf-8",
      })),
    },
    skill: {
      slug: resolvedSlug,
      displayName: skill.name,
    },
    requestedSlug,
    resolvedSlug,
  };
}

export async function listSkillVersions(slug: string, cursor: string | null, limit: number) {
  const db = getDb();
  const resolved = await resolveSkillRecord(slug);
  if (!resolved) return null;
  const { skill, resolvedSlug, requestedSlug } = resolved;

  const rows = await db
    .select({
      id: skillVersions.id,
      version: skillVersions.version,
      createdAt: skillVersions.createdAt,
      changelog: skillVersions.changelog,
      fileCount: skillVersions.fileCount,
      fileSize: skillVersions.fileSize,
    })
    .from(skillVersions)
    .where(eq(skillVersions.skillId, skill.id))
    .orderBy(desc(skillVersions.createdAt));

  const startIndex = decodeCursor(cursor);
  const page = rows.slice(startIndex, startIndex + limit);
  const nextCursor = startIndex + limit < rows.length ? String(startIndex + limit) : null;

  return {
    items: page.map((row) => ({
      id: row.id,
      version: row.version,
      createdAt: row.createdAt.getTime(),
      changelog: row.changelog ?? "",
      changelogSource: null,
      fileCount: row.fileCount ?? 0,
      fileSize: row.fileSize ?? 0,
    })),
    nextCursor,
    requestedSlug,
    resolvedSlug,
  };
}

export async function resolveSkillVersion(slug: string) {
  const resolved = await resolveSkillRecord(slug, { publicOnly: true });
  const skill = resolved?.skill ?? null;
  if (!skill?.latestVersion) {
    return { match: null, latestVersion: null };
  }
  return {
    match: null,
    latestVersion: { version: skill.latestVersion },
    resolvedSlug: resolved?.resolvedSlug ?? null,
  };
}

export async function getFileForVersion(
  slug: string,
  version: string,
  filename: string,
) {
  const db = getDb();
  const resolved = await resolveSkillRecord(slug);
  if (!resolved) return null;
  const { skill } = resolved;
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

export async function getVersionArchive(slug: string, version: string) {
  const db = getDb();
  const resolved = await resolveSkillRecord(slug);
  if (!resolved) return null;
  const { skill, resolvedSlug } = resolved;
  const versionRow = await db.query.skillVersions.findFirst({
    where: and(eq(skillVersions.skillId, skill.id), eq(skillVersions.version, version)),
  });
  if (!versionRow) return null;

  const files = await db
    .select({ filename: skillFiles.filename, storagePath: skillFiles.storagePath })
    .from(skillFiles)
    .where(eq(skillFiles.versionId, versionRow.id));

  const archiveFiles = await Promise.all(
    files.map(async (file) => ({
      filename: file.filename,
      data: await getFile(file.storagePath),
    })),
  );

  return {
    slug: resolvedSlug,
    version,
    files: archiveFiles,
  };
}

export async function checkSlugAvailability(slug: string): Promise<boolean> {
  const db = getDb();
  const existing = await db.query.skills.findFirst({ where: eq(skills.slug, slug) });
  if (existing) return false;
  const alias = await db.query.skillAliases.findFirst({ where: eq(skillAliases.sourceSlug, slug) });
  return !alias;
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
  const normalizedTags = normalizeTags(payload.tags, { fallbackToLatest: true });
  const readmeFile = files.find((file) => {
    const lower = file.filename.trim().toLowerCase();
    return lower === "skill.md" || lower === "skills.md";
  });
  const parsedMetadata = readmeFile
    ? extractMetadataFromReadme(payload.slug, readmeFile.data.toString("utf-8"))
    : null;
  const displayName =
    payload.displayName?.trim() ||
    payload.name?.trim() ||
    parsedMetadata?.displayName ||
    payload.slug;
  const summary = parsedMetadata?.summary ?? "";

  let skill = await db.query.skills.findFirst({ where: eq(skills.slug, payload.slug) });

  if (skill && skill.ownerId !== user.id) {
    throw new Error("Slug already owned by another user");
  }
  const alias = await db.query.skillAliases.findFirst({ where: eq(skillAliases.sourceSlug, payload.slug) });
  if (!skill && alias) {
    throw new Error("Slug already reserved by an old redirect");
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
        summary,
        latestVersion: payload.version,
        tags: normalizedTags,
        updatedAt: new Date(),
      })
      .returning();
    skill = inserted[0];
  } else {
    await db
      .update(skills)
      .set({
        name: displayName,
        summary,
        latestVersion: payload.version,
        tags: normalizedTags,
        updatedAt: new Date(),
      })
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

  await replaceTagsForVersion(skill.id, versionRow.id, normalizedTags);

  generateEmbeddingForSkill(skill.id, files).catch((err) =>
    console.error("Background embedding generation failed:", err),
  );

  return {
    ok: true as const,
    skillId: skill.id,
    versionId: versionRow.id,
  };
}

export async function deleteSkill(user: User, slug: string) {
  const db = getDb();
  const resolved = await resolveSkillRecord(slug);
  const skill = resolved?.skill ?? null;
  if (!skill) throw new Error("Skill not found");
  if (skill.ownerId !== user.id) throw new Error("You do not own this skill");

  const versions = await db.query.skillVersions.findMany({
    where: eq(skillVersions.skillId, skill.id),
  });

  for (const version of versions) {
    await deleteVersionDir(skill.slug, version.version).catch(() => {});
  }

  await db.delete(stars).where(eq(stars.skillId, skill.id));
  await db.delete(skillEmbeddings).where(eq(skillEmbeddings.skillId, skill.id));
  await db.delete(skillVersionTags).where(eq(skillVersionTags.skillId, skill.id));
  await db.delete(skillAliases).where(eq(skillAliases.targetSkillId, skill.id));
  for (const version of versions) {
    await db.delete(skillFiles).where(eq(skillFiles.versionId, version.id));
  }
  await db.delete(skillVersions).where(eq(skillVersions.skillId, skill.id));
  await db.delete(skills).where(eq(skills.id, skill.id));
}

export async function deleteSkillVersion(user: User, slug: string, version: string) {
  const db = getDb();
  const resolved = await resolveSkillRecord(slug);
  const skill = resolved?.skill ?? null;
  if (!skill) throw new Error("Skill not found");
  if (skill.ownerId !== user.id) throw new Error("You do not own this skill");

  const versions = await db
    .select({
      id: skillVersions.id,
      version: skillVersions.version,
      createdAt: skillVersions.createdAt,
    })
    .from(skillVersions)
    .where(eq(skillVersions.skillId, skill.id))
    .orderBy(desc(skillVersions.createdAt));

  const versionRow = versions.find((entry) => entry.version === version);
  if (!versionRow) throw new Error("Skill version not found");
  if (versions.length <= 1) throw new Error("Cannot delete the only published version");

  await deleteVersionDir(skill.slug, version).catch(() => {});
  await db.delete(skillVersionTags).where(eq(skillVersionTags.versionId, versionRow.id));
  await db.delete(skillFiles).where(eq(skillFiles.versionId, versionRow.id));
  await db.delete(skillVersions).where(eq(skillVersions.id, versionRow.id));

  const remainingVersions = versions.filter((entry) => entry.id !== versionRow.id);
  const nextLatestVersion = remainingVersions[0]?.version ?? null;
  const nextTags = await listSkillTagNames(skill.id);
  await db
    .update(skills)
    .set({
      latestVersion: nextLatestVersion,
      tags: nextTags,
      updatedAt: new Date(),
    })
    .where(eq(skills.id, skill.id));
}

export async function renameSkill(user: User, slug: string, newSlug: string) {
  const db = getDb();
  const nextSlug = newSlug.trim().toLowerCase();
  if (!nextSlug) throw new Error("New slug is required");
  if (slug === nextSlug) throw new Error("New slug must be different");

  const resolved = await resolveSkillRecord(slug);
  const skill = resolved?.skill ?? null;
  if (!skill) throw new Error("Skill not found");
  if (skill.ownerId !== user.id) throw new Error("You do not own this skill");

  const existingSkill = await db.query.skills.findFirst({ where: eq(skills.slug, nextSlug) });
  if (existingSkill && existingSkill.id !== skill.id) throw new Error("Slug already in use");
  const existingAlias = await db.query.skillAliases.findFirst({ where: eq(skillAliases.sourceSlug, nextSlug) });
  if (existingAlias && existingAlias.targetSkillId !== skill.id) throw new Error("Slug already reserved by another redirect");

  const previousSlug = skill.slug;
  await db.update(skills).set({ slug: nextSlug, updatedAt: new Date() }).where(eq(skills.id, skill.id));
  await db.delete(skillAliases).where(eq(skillAliases.sourceSlug, previousSlug));
  await db.insert(skillAliases).values({ sourceSlug: previousSlug, targetSkillId: skill.id }).onConflictDoNothing();

  return {
    ok: true as const,
    previousSlug,
    slug: nextSlug,
  };
}

export async function setSkillVersionTags(user: User, slug: string, version: string, tags: string[]) {
  const db = getDb();
  const skill = await db.query.skills.findFirst({ where: eq(skills.slug, slug) });
  if (!skill) throw new Error("Skill not found");
  if (skill.ownerId !== user.id) throw new Error("You do not own this skill");

  const versionRow = await db.query.skillVersions.findFirst({
    where: and(eq(skillVersions.skillId, skill.id), eq(skillVersions.version, version)),
  });
  if (!versionRow) throw new Error("Skill version not found");

  const normalizedTags = normalizeTags(tags, { fallbackToLatest: false });
  await replaceTagsForVersion(skill.id, versionRow.id, normalizedTags);

  return {
    ok: true as const,
    tags: await loadSkillTagMap(skill.id),
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

async function loadSkillTagMap(skillId: string) {
  const db = getDb();
  const rows = await db
    .select({
      tag: skillVersionTags.tag,
      version: skillVersions.version,
    })
    .from(skillVersionTags)
    .innerJoin(skillVersions, eq(skillVersions.id, skillVersionTags.versionId))
    .where(eq(skillVersionTags.skillId, skillId));

  return Object.fromEntries(
    rows
      .filter((row) => typeof row.tag === "string" && typeof row.version === "string")
      .map((row) => [row.tag, row.version]),
  ) as Record<string, string>;
}

async function listSkillTagNames(skillId: string) {
  const tagMap = await loadSkillTagMap(skillId);
  return Object.keys(tagMap);
}

async function replaceTagsForVersion(skillId: string, versionId: string, tags: string[]) {
  const db = getDb();
  await db
    .delete(skillVersionTags)
    .where(and(eq(skillVersionTags.skillId, skillId), eq(skillVersionTags.versionId, versionId)));

  if (tags.length > 0) {
    await db
      .delete(skillVersionTags)
      .where(and(eq(skillVersionTags.skillId, skillId), inArray(skillVersionTags.tag, tags)));
    await db.insert(skillVersionTags).values(
      tags.map((tag) => ({
        skillId,
        versionId,
        tag,
        updatedAt: new Date(),
      })),
    );
  }

  await db
    .update(skills)
    .set({
      tags: await listSkillTagNames(skillId),
      updatedAt: new Date(),
    })
    .where(eq(skills.id, skillId));
}

function defaultSkillStats() {
  return {
    stars: 0,
    downloads: 0,
    installsCurrent: 0,
    installsAllTime: 0,
    versions: 0,
  };
}

function decodeCursor(cursor: string | null) {
  const parsed = Number.parseInt(cursor ?? "0", 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

async function resolveSkillRecord(slug: string, options?: { publicOnly?: boolean }) {
  const db = getDb();
  const publicOnly = options?.publicOnly ?? false;

  const direct = await db.query.skills.findFirst({
    where: publicOnly
      ? and(eq(skills.slug, slug), eq(skills.visibility, "public"))
      : eq(skills.slug, slug),
  });
  if (direct) {
    return {
      skill: direct,
      requestedSlug: slug,
      resolvedSlug: direct.slug,
    };
  }

  const alias = await db.query.skillAliases.findFirst({ where: eq(skillAliases.sourceSlug, slug) });
  if (!alias) return null;
  const target = await db.query.skills.findFirst({
    where: publicOnly
      ? and(eq(skills.id, alias.targetSkillId), eq(skills.visibility, "public"))
      : eq(skills.id, alias.targetSkillId),
  });
  if (!target) return null;

  return {
    skill: target,
    requestedSlug: slug,
    resolvedSlug: target.slug,
  };
}

function extractMetadataFromReadme(slug: string, readme: string) {
  const lines = readme.replace(/\r\n/g, "\n").split("\n");
  let displayName: string | null = null;
  let summary: string | null = null;
  let inFrontmatter = false;
  let frontmatterStarted = false;
  let inCodeFence = false;

  for (const rawLine of lines) {
    const line = rawLine.trim();

    if (!frontmatterStarted && line === "---") {
      inFrontmatter = true;
      frontmatterStarted = true;
      continue;
    }
    if (inFrontmatter) {
      if (line === "---") inFrontmatter = false;
      continue;
    }

    if (line.startsWith("```")) {
      inCodeFence = !inCodeFence;
      continue;
    }
    if (inCodeFence || !line) continue;

    if (!displayName && line.startsWith("# ")) {
      displayName = line.slice(2).trim();
      continue;
    }

    if (!summary && !line.startsWith("#")) {
      summary = normalizeSummaryLine(line);
      break;
    }
  }

  return {
    displayName: displayName || slugToTitle(slug),
    summary,
  };
}

function slugToTitle(slug: string) {
  return slug
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function normalizeSummaryLine(line: string) {
  return line
    .replace(/^[-*+]\s+/, "")
    .replace(/^\d+\.\s+/, "")
    .trim();
}

function normalizeTags(tags: string[] | undefined, options: { fallbackToLatest: boolean }) {
  const normalized = Array.from(
    new Set(
      (tags ?? [])
        .map((tag) => tag.trim().toLowerCase())
        .filter(Boolean),
    ),
  );
  if (normalized.length > 0) return normalized;
  return options.fallbackToLatest ? ["latest"] : [];
}
