import { and, eq } from "drizzle-orm";
import { readdir, readFile } from "node:fs/promises";
import { basename, join, relative } from "node:path";
import pg from "pg";
import { startDatabase, stopDatabase, getDb } from "../db/index";
import { skillVersions, skills, users } from "../db/schema/index";
import { publishSkill } from "../services/skill";

const SOURCE_ROOT = process.env.QCLAW_SKILLS_DIR ?? "/Users/yanfei/.qclaw/skills";
const IMPORT_USERNAME = process.env.LOCAL_IMPORT_USERNAME ?? "qclaw";
const DEFAULT_VERSION = process.env.LOCAL_IMPORT_VERSION ?? "1.0.0";
const LOCAL_DB_URL =
  process.env.LOCAL_IMPORT_DATABASE_URL ??
  "postgresql://postgres:password@localhost:54321/clawhub";

async function main() {
  const usingExistingDb = await canConnectToExistingLocalDb();
  if (usingExistingDb) {
    process.env.DATABASE_URL = LOCAL_DB_URL;
  }

  await startDatabase();

  try {
    const db = getDb();
    const owner = await ensureImportUser();
    const skillDirs = await listSkillDirectories(SOURCE_ROOT);

    let imported = 0;
    let skipped = 0;

    for (const skillDir of skillDirs) {
      const slug = basename(skillDir);
      const skillFilePath = join(skillDir, "SKILL.md");
      const readme = await readFile(skillFilePath, "utf8");
      const { displayName, summary } = extractMetadata(slug, readme);

      const existingSkill = await db.query.skills.findFirst({
        where: eq(skills.slug, slug),
      });

      if (existingSkill) {
        const existingVersion = await db.query.skillVersions.findFirst({
          where: and(
            eq(skillVersions.skillId, existingSkill.id),
            eq(skillVersions.version, DEFAULT_VERSION),
          ),
        });
        if (existingVersion) {
          skipped += 1;
          console.log(`skip ${slug}: version ${DEFAULT_VERSION} already exists`);
          continue;
        }
      }

      const files = await collectFiles(skillDir);
      await publishSkill(
        owner,
        {
          slug,
          displayName,
          version: DEFAULT_VERSION,
          changelog: "Imported from local qclaw skills directory",
          tags: ["latest"],
        },
        files,
      );

      await db
        .update(skills)
        .set({
          name: displayName,
          summary,
          updatedAt: new Date(),
        })
        .where(eq(skills.slug, slug));

      imported += 1;
      console.log(`import ${slug}: ${files.length} files`);
    }

    console.log(
      `done: scanned=${skillDirs.length} imported=${imported} skipped=${skipped} source=${SOURCE_ROOT}`,
    );
  } finally {
    await stopDatabase();
  }
}

async function canConnectToExistingLocalDb() {
  const pool = new pg.Pool({ connectionString: LOCAL_DB_URL });
  try {
    await pool.query("select 1");
    return true;
  } catch {
    return false;
  } finally {
    await pool.end().catch(() => {});
  }
}

async function ensureImportUser() {
  const db = getDb();
  const existing = await db.query.users.findFirst({
    where: eq(users.username, IMPORT_USERNAME),
  });
  if (existing) return existing;

  const inserted = await db
    .insert(users)
    .values({
      username: IMPORT_USERNAME,
      realName: "Local qclaw import",
      email: `${IMPORT_USERNAME}@local.test`,
    })
    .returning();

  return inserted[0];
}

async function listSkillDirectories(root: string) {
  const entries = await readdir(root, { withFileTypes: true });
  const results: string[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const dir = join(root, entry.name);
    const children = await readdir(dir);
    if (children.includes("SKILL.md")) {
      results.push(dir);
    }
  }

  return results.sort((a, b) => a.localeCompare(b));
}

async function collectFiles(root: string): Promise<Array<{ filename: string; data: Buffer }>> {
  const files: Array<{ filename: string; data: Buffer }> = [];
  await walk(root, async (path) => {
    const rel = relative(root, path);
    const normalized = rel.replaceAll("\\", "/");
    if (shouldIgnorePath(normalized)) return;
    files.push({
      filename: normalized,
      data: await readFile(path),
    });
  });
  return files.sort((a, b) => a.filename.localeCompare(b.filename));
}

async function walk(
  dir: string,
  onFile: (path: string) => Promise<void>,
): Promise<void> {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (shouldIgnorePath(entry.name)) continue;
      await walk(path, onFile);
      continue;
    }
    if (entry.isFile()) {
      await onFile(path);
    }
  }
}

function shouldIgnorePath(path: string) {
  return (
    path.startsWith(".git/") ||
    path === ".DS_Store" ||
    path.startsWith("__MACOSX/") ||
    path.split("/").some((part) => part === ".git" || part === "__MACOSX")
  );
}

function extractMetadata(slug: string, readme: string) {
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
      if (line === "---") {
        inFrontmatter = false;
      }
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
      summary = line;
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

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
