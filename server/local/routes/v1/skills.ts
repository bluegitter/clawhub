import { Hono } from "hono";
import { requireAuth, optionalAuth } from "../../middleware/auth";
import {
  listSkills,
  getSkillBySlug,
  getVersionDetail,
  listSkillVersions,
  checkSlugAvailability,
  publishSkill,
  getFileForVersion,
} from "../../services/skill";
import { DEFAULT_PAGE_SIZE } from "../../db/env";
import { getFile, readAllVersionFiles } from "../../storage/index";
import { buildDeterministicZip } from "../../services/zipBuilder";
import type { AuthVariables } from "../../middleware/auth";

const app = new Hono<{ Variables: AuthVariables }>();

function toResponseBody(data: Uint8Array | Buffer) {
  return Uint8Array.from(data);
}

app.get("/", optionalAuth, async (c) => {
  const cursor = c.req.query("cursor") ?? null;
  const limit = Math.min(parseInt(c.req.query("limit") ?? String(DEFAULT_PAGE_SIZE)), 100);
  const result = await listSkills(cursor, limit);
  return c.json(result);
});

app.get("/:slug/availability", optionalAuth, async (c) => {
  const slug = c.req.param("slug");
  const available = await checkSlugAvailability(slug);
  return c.json({ available });
});

app.get("/:slug", optionalAuth, async (c) => {
  const slug = c.req.param("slug");
  const skill = await getSkillBySlug(slug);
  if (!skill) return c.json({ error: "Not found" }, 404);
  return c.json(skill);
});

app.get("/:slug/versions/:version", optionalAuth, async (c) => {
  const slug = c.req.param("slug");
  const version = c.req.param("version");
  const detail = await getVersionDetail(slug, version);
  if (!detail) return c.json({ error: "Not found" }, 404);
  return c.json(detail);
});

app.get("/:slug/versions", optionalAuth, async (c) => {
  const slug = c.req.param("slug");
  const cursor = c.req.query("cursor") ?? null;
  const limit = Math.min(parseInt(c.req.query("limit") ?? String(DEFAULT_PAGE_SIZE)), 100);
  const result = await listSkillVersions(slug, cursor, limit);
  if (!result) return c.json({ error: "Not found" }, 404);
  return c.json(result);
});

app.get("/:slug/versions/:version/download", optionalAuth, async (c) => {
  const slug = c.req.param("slug");
  const version = c.req.param("version");
  try {
    const files = await readAllVersionFiles(slug, version);
    if (files.length === 0) return c.json({ error: "No files" }, 404);

    const zip = buildDeterministicZip(
      files.map((f) => ({ name: f.filename, data: new Uint8Array(f.data) })),
    );
    return new Response(toResponseBody(zip), {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${slug}-${version}.zip"`,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Download failed";
    return c.json({ error: message }, 500);
  }
});

app.get("/:slug/file", optionalAuth, async (c) => {
  const slug = c.req.param("slug");
  const requestedVersion = c.req.query("version")?.trim();
  const requestedTag = c.req.query("tag")?.trim();
  const filename = c.req.query("path")?.trim();
  if (!filename) return c.json({ error: "path is required" }, 400);

  try {
    const skill = await getSkillBySlug(slug);
    if (!skill?.skill) return c.json({ error: "Not found" }, 404);

    const tags =
      skill.skill.tags && typeof skill.skill.tags === "object"
        ? (skill.skill.tags as Record<string, string>)
        : {};
    const version =
      requestedVersion ||
      (requestedTag ? tags[requestedTag] : null) ||
      skill.latestVersion?.version;
    if (!version) return c.json({ error: "Version not found" }, 404);

    const fileEntry = await getFileForVersion(slug, version, filename);
    if (!fileEntry) return c.json({ error: "File not found" }, 404);

    const fileData = await getFile(fileEntry.storagePath);
    const isSvg = filename.toLowerCase().endsWith(".svg");
    const headers: Record<string, string> = {
      "Content-Type": "text/plain; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
    };
    if (isSvg) {
      headers["Content-Disposition"] = `attachment; filename="${filename}"`;
      headers["Content-Security-Policy"] =
        "default-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";
    }
    return new Response(toResponseBody(fileData), { headers });
  } catch {
    return c.json({ error: "File not found" }, 404);
  }
});

app.post("/", requireAuth, async (c) => {
  const user = c.get("user");
  const contentType = c.req.header("content-type") ?? "";

  if (!contentType.includes("multipart/form-data")) {
    return c.json({ error: "Content-Type must be multipart/form-data" }, 400);
  }

  const body = await c.req.parseBody();
  const payloadStr = body["payload"];
  if (typeof payloadStr !== "string") {
    return c.json({ error: "Missing payload" }, 400);
  }

  let payload: {
    slug: string;
    name?: string;
    displayName?: string;
    version: string;
    changelog?: string;
    tags?: string[];
  };
  try {
    payload = JSON.parse(payloadStr);
  } catch {
    return c.json({ error: "Invalid payload JSON" }, 400);
  }

  if (!payload.slug || !(payload.name || payload.displayName) || !payload.version) {
    return c.json({ error: "slug, displayName, and version are required" }, 400);
  }

  const fileEntries: Array<{ filename: string; data: Buffer }> = [];
  let idx = 0;
  while (true) {
    const file = body[`files[${idx}]`] ?? body[`files`];
    if (!file || !(file instanceof File)) break;
    const buf = Buffer.from(await file.arrayBuffer());
    fileEntries.push({ filename: file.name, data: buf });
    idx++;
    if (idx > 200) break;
  }

  if (fileEntries.length === 0) {
    return c.json({ error: "No files provided" }, 400);
  }

  if (!fileEntries.some((f) => f.filename.toLowerCase() === "skill.md")) {
    return c.json({ error: "SKILL.md is required" }, 400);
  }

  try {
    const result = await publishSkill(user, payload, fileEntries);
    return c.json(result, 201);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Publish failed";
    return c.json({ error: message }, 400);
  }
});

export default app;
