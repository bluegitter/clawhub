import { readFile } from "node:fs/promises";
import { getPool, startDatabase, stopDatabase } from "../db/index";

const tableOrder = [
  "users",
  "sessions",
  "api_tokens",
  "skills",
  "skill_versions",
  "skill_files",
  "stars",
  "skill_embeddings",
] as const;

type TableName = (typeof tableOrder)[number];
type Snapshot = Record<TableName, Record<string, unknown>[]>;

function quoteIdent(name: string) {
  return `"${name.replace(/"/g, "\"\"")}"`;
}

async function insertRows(table: string, rows: Record<string, unknown>[]) {
  if (rows.length === 0) return;

  const pool = getPool();
  const columns = Object.keys(rows[0]);
  const quotedColumns = columns.map(quoteIdent).join(", ");
  const values: unknown[] = [];

  const valueGroups = rows.map((row, rowIndex) => {
    const placeholders = columns.map((column, columnIndex) => {
      values.push(row[column] ?? null);
      return `$${rowIndex * columns.length + columnIndex + 1}`;
    });
    return `(${placeholders.join(", ")})`;
  });

  await pool.query(
    `INSERT INTO ${quoteIdent(table)} (${quotedColumns}) VALUES ${valueGroups.join(", ")}`,
    values,
  );
}

async function main() {
  const snapshotPath = process.argv[2];
  if (!snapshotPath) {
    throw new Error("Usage: tsx server/local/scripts/import-local-snapshot.ts <snapshot.json>");
  }

  const raw = await readFile(snapshotPath, "utf8");
  const snapshot = JSON.parse(raw) as Snapshot;

  await startDatabase();
  const pool = getPool();

  await pool.query(`
    TRUNCATE TABLE
      skill_version_tags,
      skill_aliases,
      skill_files,
      skill_versions,
      stars,
      skill_embeddings,
      api_tokens,
      sessions,
      skills,
      users
    RESTART IDENTITY CASCADE
  `);

  for (const table of tableOrder) {
    await insertRows(table, snapshot[table] ?? []);
    console.log(`imported ${table}: ${(snapshot[table] ?? []).length}`);
  }

  await stopDatabase();
}

main().catch(async (error) => {
  console.error(error);
  await stopDatabase().catch(() => {});
  process.exit(1);
});
