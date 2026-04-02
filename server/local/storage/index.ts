import { mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { STORAGE_ROOT } from "../db/env";

export async function storeFile(
  slug: string,
  version: string,
  filename: string,
  data: Buffer,
): Promise<{ storagePath: string; sha256: string; size: number }> {
  const dir = join(STORAGE_ROOT, slug, version);
  await mkdir(dir, { recursive: true });

  const safeName = filename.replace(/[\/\\]/g, "_");
  const filePath = join(dir, safeName);
  await writeFile(filePath, data);

  const sha256 = createHash("sha256").update(data).digest("hex");
  return { storagePath: join(slug, version, safeName), sha256, size: data.length };
}

export async function getFile(storagePath: string): Promise<Buffer> {
  return readFile(join(STORAGE_ROOT, storagePath));
}

export async function getFileBySlugVersion(
  slug: string,
  version: string,
  filename: string,
): Promise<Buffer> {
  return readFile(join(STORAGE_ROOT, slug, version, filename));
}

export async function listVersionFiles(
  slug: string,
  version: string,
): Promise<string[]> {
  const dir = join(STORAGE_ROOT, slug, version);
  try {
    await stat(dir);
  } catch {
    return [];
  }
  return readdir(dir);
}

export async function deleteVersionDir(slug: string, version: string): Promise<void> {
  const dir = join(STORAGE_ROOT, slug, version);
  await rm(dir, { recursive: true, force: true });
}

export async function readAllVersionFiles(
  slug: string,
  version: string,
): Promise<Array<{ filename: string; data: Buffer }>> {
  const filenames = await listVersionFiles(slug, version);
  const results: Array<{ filename: string; data: Buffer }> = [];
  for (const filename of filenames) {
    const data = await readFile(join(STORAGE_ROOT, slug, version, filename));
    results.push({ filename, data });
  }
  return results;
}
