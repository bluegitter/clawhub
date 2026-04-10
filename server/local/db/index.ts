import pg from "pg";
import { spawn } from "node:child_process";
import { access, mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join, relative } from "node:path";
import { pathToFileURL } from "node:url";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import * as schema from "./schema/index";

const EMBEDDED_PORT = 54321;
const EMBEDDED_DATA_DIR = "data/pg";
const EMBEDDED_DB_NAME = "clawhub";
const EMBEDDED_USER = "postgres";
const EMBEDDED_PASSWORD = "password";

let embeddedPg: EmbeddedPostgresLike | null = null;
let pool: pg.Pool | null = null;
let _db: DrizzleDb | null = null;
const require = createRequire(import.meta.url);

export type DrizzleDb = ReturnType<typeof drizzle<typeof schema>>;
export type DB = DrizzleDb;

function getConnectionString(): string {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  return `postgresql://${EMBEDDED_USER}:${EMBEDDED_PASSWORD}@localhost:${EMBEDDED_PORT}/${EMBEDDED_DB_NAME}`;
}

export async function startDatabase(): Promise<{ db: DB; pool: pg.Pool }> {
  const connectionString = getConnectionString();

  if (!process.env.DATABASE_URL) {
    await ensureEmbeddedPostgresSymlinks();

    const embeddedPostgresModule = await import("embedded-postgres");
    const EmbeddedPostgres = embeddedPostgresModule.default;
    embeddedPg = new EmbeddedPostgres({
      databaseDir: EMBEDDED_DATA_DIR,
      port: EMBEDDED_PORT,
      user: EMBEDDED_USER,
      password: EMBEDDED_PASSWORD,
      persistent: true,
      onLog: (message: string) => {
        const trimmed = message.trim();
        if (trimmed) console.log(`[embedded-postgres] ${trimmed}`);
      },
      onError: (messageOrError: unknown) => {
        console.error("[embedded-postgres]", messageOrError);
      },
    });

    const isInitialized = await hasInitializedCluster(EMBEDDED_DATA_DIR);
    if (!isInitialized) {
      await rm(EMBEDDED_DATA_DIR, { recursive: true, force: true });
      try {
        await embeddedPg.initialise();
      } catch (error) {
        if (process.platform !== "linux") throw error;
        console.warn("embedded-postgres initialise() failed; falling back to direct initdb on Linux.");
        await manualInitialiseEmbeddedCluster(EMBEDDED_DATA_DIR);
      }
    }

    if (process.platform === "linux") {
      await normalizeEmbeddedPostgresConfig(EMBEDDED_DATA_DIR);
    }

    await embeddedPg.start();
    await embeddedPg.createDatabase(EMBEDDED_DB_NAME).catch(() => {});

    const dbPool = new pg.Pool({ connectionString });
    await dbPool.query("CREATE EXTENSION IF NOT EXISTS vector").catch(() => {});
    await dbPool.end();
  }

  pool = new pg.Pool({ connectionString });
  _db = drizzle(pool, { schema });

  try {
    await migrate(_db, { migrationsFolder: "server/local/db/migrations" });
  } catch {
    console.warn("No local database migrations found; bootstrapping local schema directly.");
    await ensureLocalSchema(_db);
  }

  return { db: _db, pool };
}

export function getDb(): DB {
  if (!_db) throw new Error("Database not initialized. Call startDatabase() first.");
  return _db;
}

export function getPool(): pg.Pool {
  if (!pool) throw new Error("Pool not initialized. Call startDatabase() first.");
  return pool;
}

export async function stopDatabase(): Promise<void> {
  await pool?.end();
  await embeddedPg?.stop();
  pool = null;
  _db = null;
  embeddedPg = null;
}

interface EmbeddedPostgresLike {
  initialise(): Promise<void>;
  start(): Promise<void>;
  stop(): Promise<void>;
  createDatabase(name: string): Promise<void>;
}

async function hasInitializedCluster(databaseDir: string) {
  try {
    await access(join(databaseDir, "PG_VERSION"));
    return true;
  } catch {
    return false;
  }
}

async function ensureEmbeddedPostgresSymlinks() {
  const nativeDir = await resolveEmbeddedPostgresNativeDir();
  const symlinkManifestPath = join(nativeDir, "pg-symlinks.json");
  const manifestRaw = await readFile(symlinkManifestPath, "utf8");
  const manifest = JSON.parse(manifestRaw) as Array<{ source: string; target: string }>;

  for (const entry of manifest) {
    const sourcePath = join(nativeDir, entry.source.replace(/^native\//, ""));
    const targetPath = join(nativeDir, entry.target.replace(/^native\//, ""));
    const targetDir = dirname(targetPath);
    await mkdir(targetDir, { recursive: true });

    try {
      await access(targetPath);
      continue;
    } catch {
      const relativeSource = relative(targetDir, sourcePath);
      await symlink(relativeSource, targetPath);
    }
  }
}

async function manualInitialiseEmbeddedCluster(databaseDir: string) {
  const nativeDir = await resolveEmbeddedPostgresNativeDir();
  const initdbPath = join(nativeDir, "bin", "initdb");
  const passwordFile = join("/tmp", `clawhub-pg-password-${process.pid}.txt`);

  await mkdir(dirname(databaseDir), { recursive: true });

  try {
    await writeFile(passwordFile, `${EMBEDDED_PASSWORD}\n`);
    await runChildProcess(initdbPath, [
      `--pgdata=${databaseDir}`,
      "--auth=password",
      `--username=${EMBEDDED_USER}`,
      `--pwfile=${passwordFile}`,
      "--lc-messages=C",
    ]);
  } finally {
    await rm(passwordFile, { force: true }).catch(() => {});
  }
}

async function normalizeEmbeddedPostgresConfig(databaseDir: string) {
  const configPath = join(databaseDir, "postgresql.conf");
  try {
    const current = await readFile(configPath, "utf8");
    const normalized = current.replace(
      /^lc_messages\s*=\s*'en_US\.UTF-8'$/m,
      "lc_messages = 'C'",
    );
    if (normalized !== current) {
      await writeFile(configPath, normalized);
    }
  } catch {
    // ignore missing config on first bootstrap
  }
}

async function runChildProcess(command: string, args: string[]) {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, {
      env: {
        ...process.env,
        LC_ALL: "C",
        LANG: "C",
        LC_MESSAGES: "C",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });

    child.stdout.on("data", (chunk) => {
      const message = chunk.toString("utf8").trim();
      if (message) console.log(`[embedded-postgres] ${message}`);
    });

    child.stderr.on("data", (chunk) => {
      const message = chunk.toString("utf8").trim();
      if (message) console.error(`[embedded-postgres] ${message}`);
    });

    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Command failed: ${command} ${args.join(" ")} (exit ${code ?? "null"})`));
      }
    });
  });
}

async function resolveEmbeddedPostgresNativeDir() {
  const packageName = getEmbeddedPostgresPackageName();
  const embeddedPostgresEntry = require.resolve("embedded-postgres");
  const embeddedPostgresRequire = createRequire(embeddedPostgresEntry);
  const moduleEntry = embeddedPostgresRequire.resolve(packageName);
  const module = (await import(pathToFileURL(moduleEntry).href)) as { initdb: string };
  return dirname(dirname(module.initdb));
}

function getEmbeddedPostgresPackageName() {
  if (process.platform === "darwin" && process.arch === "x64") {
    return "@embedded-postgres/darwin-x64";
  }
  if (process.platform === "darwin" && process.arch === "arm64") {
    return "@embedded-postgres/darwin-arm64";
  }
  if (process.platform === "linux" && process.arch === "x64") {
    return "@embedded-postgres/linux-x64";
  }
  if (process.platform === "linux" && process.arch === "arm64") {
    return "@embedded-postgres/linux-arm64";
  }
  if (process.platform === "linux" && process.arch === "arm") {
    return "@embedded-postgres/linux-arm";
  }
  if (process.platform === "linux" && process.arch === "ia32") {
    return "@embedded-postgres/linux-ia32";
  }
  if (process.platform === "linux" && process.arch === "ppc64") {
    return "@embedded-postgres/linux-ppc64";
  }
  if (process.platform === "win32" && process.arch === "x64") {
    return "@embedded-postgres/windows-x64";
  }
  throw new Error(`Unsupported embedded-postgres platform: ${process.platform}/${process.arch}`);
}

async function ensureLocalSchema(db: DB) {
  await db.execute(sql.raw(`CREATE EXTENSION IF NOT EXISTS pgcrypto;`)).catch(() => {});

  await db.execute(sql.raw(`
    CREATE TABLE IF NOT EXISTS users (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      username text NOT NULL UNIQUE,
      real_name text,
      email text,
      phone text,
      image text,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );
  `));

  await db.execute(sql.raw(`
    CREATE TABLE IF NOT EXISTS sessions (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id uuid NOT NULL REFERENCES users(id) ON DELETE cascade,
      token text NOT NULL UNIQUE,
      expires_at timestamptz NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    );
  `));

  await db.execute(sql.raw(`
    CREATE TABLE IF NOT EXISTS api_tokens (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id uuid NOT NULL REFERENCES users(id) ON DELETE cascade,
      token_hash text NOT NULL UNIQUE,
      token_prefix text NOT NULL,
      name text,
      created_at timestamptz NOT NULL DEFAULT now()
    );
  `));

  await db.execute(sql.raw(`
    CREATE TABLE IF NOT EXISTS skills (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      slug text NOT NULL UNIQUE,
      owner_id uuid NOT NULL REFERENCES users(id),
      name text NOT NULL,
      summary text,
      description text,
      icon_url text,
      latest_version text,
      visibility text NOT NULL DEFAULT 'public',
      tags text[] DEFAULT ARRAY[]::text[],
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );
  `));

  await db.execute(sql.raw(`
    CREATE TABLE IF NOT EXISTS stars (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id uuid NOT NULL REFERENCES users(id) ON DELETE cascade,
      skill_id uuid NOT NULL REFERENCES skills(id) ON DELETE cascade,
      created_at timestamptz NOT NULL DEFAULT now()
    );
  `));

  await db.execute(sql.raw(`
    CREATE TABLE IF NOT EXISTS skill_versions (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      skill_id uuid NOT NULL REFERENCES skills(id) ON DELETE cascade,
      version text NOT NULL,
      changelog text,
      file_size integer DEFAULT 0,
      file_count integer DEFAULT 0,
      storage_path text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    );
  `));

  await db.execute(sql.raw(`
    CREATE TABLE IF NOT EXISTS skill_downloads (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      skill_id uuid NOT NULL REFERENCES skills(id) ON DELETE cascade,
      version_id uuid REFERENCES skill_versions(id) ON DELETE SET NULL,
      identity_key text NOT NULL,
      hour_bucket integer NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    );
  `));

  await db.execute(sql.raw(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_skill_downloads_unique_hour
    ON skill_downloads (skill_id, identity_key, hour_bucket);
  `));

  await db.execute(sql.raw(`
    CREATE INDEX IF NOT EXISTS idx_skill_downloads_skill
    ON skill_downloads (skill_id);
  `));

  await db.execute(sql.raw(`
    CREATE INDEX IF NOT EXISTS idx_skill_downloads_version
    ON skill_downloads (version_id);
  `));

  await db.execute(sql.raw(`
    CREATE TABLE IF NOT EXISTS skill_files (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      version_id uuid NOT NULL REFERENCES skill_versions(id) ON DELETE cascade,
      filename text NOT NULL,
      storage_path text NOT NULL,
      sha256 text,
      size integer DEFAULT 0
    );
  `));

  await db.execute(sql.raw(`
    CREATE TABLE IF NOT EXISTS skill_labels (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      skill_id uuid NOT NULL REFERENCES skills(id) ON DELETE cascade,
      label text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT idx_skill_labels_skill_label_unique UNIQUE (skill_id, label)
    );
  `));

  await db.execute(sql.raw(`
    CREATE TABLE IF NOT EXISTS skill_version_tags (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      skill_id uuid NOT NULL REFERENCES skills(id) ON DELETE cascade,
      version_id uuid NOT NULL REFERENCES skill_versions(id) ON DELETE cascade,
      tag text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT idx_svt_skill_tag_unique UNIQUE (skill_id, tag)
    );
  `));

  await db.execute(sql.raw(`
    CREATE TABLE IF NOT EXISTS skill_aliases (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      source_slug text NOT NULL,
      target_skill_id uuid NOT NULL REFERENCES skills(id) ON DELETE cascade,
      created_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT idx_skill_aliases_source_slug_unique UNIQUE (source_slug)
    );
  `));

  await db.execute(sql.raw(`
    CREATE TABLE IF NOT EXISTS skill_embeddings (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      skill_id uuid NOT NULL REFERENCES skills(id) ON DELETE cascade,
      embedding jsonb,
      created_at timestamptz NOT NULL DEFAULT now()
    );
  `)).catch(() => {});

  await db.execute(sql.raw(`CREATE INDEX IF NOT EXISTS idx_skills_owner ON skills(owner_id);`));
  await db.execute(sql.raw(`CREATE INDEX IF NOT EXISTS idx_skills_updated ON skills(updated_at);`));
  await db.execute(sql.raw(`CREATE INDEX IF NOT EXISTS idx_skills_owner_visibility ON skills(owner_id, visibility);`));
  await db.execute(sql.raw(`CREATE UNIQUE INDEX IF NOT EXISTS idx_stars_user_skill_unique ON stars(user_id, skill_id);`));
  await db.execute(sql.raw(`CREATE INDEX IF NOT EXISTS idx_stars_user ON stars(user_id);`));
  await db.execute(sql.raw(`CREATE INDEX IF NOT EXISTS idx_stars_skill ON stars(skill_id);`));
  await db.execute(sql.raw(`CREATE INDEX IF NOT EXISTS idx_sv_skill_version ON skill_versions(skill_id, version);`));
  await db.execute(sql.raw(`CREATE INDEX IF NOT EXISTS idx_sv_skill ON skill_versions(skill_id);`));
  await db.execute(sql.raw(`CREATE INDEX IF NOT EXISTS idx_sf_version ON skill_files(version_id);`));
  await db.execute(sql.raw(`CREATE INDEX IF NOT EXISTS idx_skill_labels_label ON skill_labels(label);`));
  await db.execute(sql.raw(`CREATE INDEX IF NOT EXISTS idx_skill_labels_skill ON skill_labels(skill_id);`));
  await db.execute(sql.raw(`CREATE INDEX IF NOT EXISTS idx_svt_version ON skill_version_tags(version_id);`));
  await db.execute(sql.raw(`CREATE INDEX IF NOT EXISTS idx_svt_skill ON skill_version_tags(skill_id);`));
  await db.execute(sql.raw(`CREATE INDEX IF NOT EXISTS idx_skill_aliases_target_skill ON skill_aliases(target_skill_id);`));
  await db.execute(sql.raw(`CREATE INDEX IF NOT EXISTS idx_se_skill ON skill_embeddings(skill_id);`)).catch(() => {});
}
