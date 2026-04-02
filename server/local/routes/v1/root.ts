import { Hono } from "hono";
import { requireAuth, optionalAuth } from "../../middleware/auth";
import { searchSkills } from "../../services/search";
import { resolveSkillVersion } from "../../services/skill";
import { readAllVersionFiles } from "../../storage/index";
import { buildDeterministicZip } from "../../services/zipBuilder";
import type { AuthVariables } from "../../middleware/auth";

const app = new Hono<{ Variables: AuthVariables }>();

function toResponseBody(data: Uint8Array | Buffer) {
  return Uint8Array.from(data);
}

app.get("/search", optionalAuth, async (c) => {
  const query = c.req.query("q") ?? "";
  const limit = Math.min(parseInt(c.req.query("limit") ?? "20"), 100);
  const results = await searchSkills(query, limit);
  return c.json({
    results: results.map((entry) => ({
      slug: entry.slug,
      displayName: entry.name,
      summary: entry.summary,
      version: entry.latestVersion,
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

export default app;
