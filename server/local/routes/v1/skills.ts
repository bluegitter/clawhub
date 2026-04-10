import { Hono } from "hono";
import { createHash } from "node:crypto";
import { requireAuth, optionalAuth } from "../../middleware/auth";
import {
  listSkills,
  getSkillBySlug,
  getVersionDetail,
  listSkillVersions,
  checkSlugAvailability,
  publishSkill,
  deleteSkill,
  deleteSkillVersion,
  renameSkill,
  setSkillVersionTags,
  setSkillLabels,
  listAvailableSkillLabels,
  getFileForVersion,
  getVersionArchive,
  recordSkillDownload,
} from "../../services/skill";
import { DEFAULT_PAGE_SIZE } from "../../db/env";
import { getFile } from "../../storage/index";
import { buildDeterministicZip } from "../../services/zipBuilder";
import type { AuthVariables } from "../../middleware/auth";

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

app.get("/", optionalAuth, async (c) => {
  const cursor = c.req.query("cursor") ?? null;
  const limit = Math.min(parseInt(c.req.query("limit") ?? String(DEFAULT_PAGE_SIZE)), 100);
  const label = c.req.query("label")?.trim() ?? null;
  const rawSort = c.req.query("sort")?.trim();
  const rawDir = c.req.query("dir")?.trim();
  const sort =
    rawSort === "newest" ||
    rawSort === "downloads" ||
    rawSort === "installs" ||
    rawSort === "stars" ||
    rawSort === "name" ||
    rawSort === "updated"
      ? rawSort
      : undefined;
  const dir = rawDir === "asc" || rawDir === "desc" ? rawDir : undefined;
  const result = await listSkills(cursor, limit, { label, sort, dir });
  return c.json(result);
});

app.get("/labels", optionalAuth, async (c) => {
  const result = await listAvailableSkillLabels();
  return c.json({ items: result });
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
    labels?: string[];
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

app.put("/:slug/rename", requireAuth, async (c) => {
  const user = c.get("user");
  const slug = c.req.param("slug");
  let body: { newSlug?: string };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400);
  }

  try {
    const result = await renameSkill(user, slug, body.newSlug ?? "");
    return c.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Rename failed";
    const status =
      message === "Skill not found"
        ? 404
        : message === "You do not own this skill"
          ? 403
          : 400;
    return c.json({ error: message }, status);
  }
});

app.delete("/:slug", requireAuth, async (c) => {
  const user = c.get("user");
  const slug = c.req.param("slug");
  try {
    await deleteSkill(user, slug);
    return c.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Delete failed";
    const status = message === "Skill not found" ? 404 : message === "You do not own this skill" ? 403 : 400;
    return c.json({ error: message }, status);
  }
});

app.delete("/:slug/versions/:version", requireAuth, async (c) => {
  const user = c.get("user");
  const slug = c.req.param("slug");
  const version = c.req.param("version");
  try {
    await deleteSkillVersion(user, slug, version);
    return c.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Delete failed";
    const status =
      message === "Skill not found" || message === "Skill version not found"
        ? 404
        : message === "You do not own this skill"
          ? 403
          : 400;
    return c.json({ error: message }, status);
  }
});

app.put("/:slug/versions/:version/tags", requireAuth, async (c) => {
  const user = c.get("user");
  const slug = c.req.param("slug");
  const version = c.req.param("version");
  let body: { tags?: string[] };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400);
  }

  try {
    const result = await setSkillVersionTags(user, slug, version, Array.isArray(body.tags) ? body.tags : []);
    return c.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Update tags failed";
    const status =
      message === "Skill not found" || message === "Skill version not found"
        ? 404
        : message === "You do not own this skill"
          ? 403
          : 400;
    return c.json({ error: message }, status);
  }
});

app.put("/:slug/labels", requireAuth, async (c) => {
  const user = c.get("user");
  const slug = c.req.param("slug");
  let body: { labels?: string[] };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400);
  }

  try {
    const result = await setSkillLabels(user, slug, Array.isArray(body.labels) ? body.labels : []);
    return c.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Update labels failed";
    const status =
      message === "Skill not found"
        ? 404
        : message === "You do not own this skill"
          ? 403
          : 400;
    return c.json({ error: message }, status);
  }
});

export default app;
