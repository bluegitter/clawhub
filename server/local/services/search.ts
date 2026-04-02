import { eq, desc, sql } from "drizzle-orm";
import { getDb } from "../db/index";
import { skills, skillEmbeddings } from "../db/schema/index";
import { OPENAI_API_KEY } from "../db/env";

export async function searchSkills(query: string, limit: number) {
  const db = getDb();

  if (!query.trim()) {
    return db
      .select({
        id: skills.id,
        slug: skills.slug,
        name: skills.name,
        summary: skills.summary,
        latestVersion: skills.latestVersion,
        tags: skills.tags,
        updatedAt: skills.updatedAt,
      })
      .from(skills)
      .where(eq(skills.visibility, "public"))
      .orderBy(desc(skills.updatedAt))
      .limit(limit);
  }

  const normalizedQuery = query.trim().toLowerCase();
  const lexicalRows = await lexicalSearch(normalizedQuery, limit);

  if (lexicalRows.length > 0) {
    return lexicalRows;
  }

  const vectorRows =
    query.trim().length > 2 && OPENAI_API_KEY ? await vectorSearch(query, limit) : [];

  return mergeSearchResults([], vectorRows, limit);
}

async function lexicalSearch(query: string, limit: number) {
  const db = getDb();
  const rows = await db
    .select({
      id: skills.id,
      slug: skills.slug,
      name: skills.name,
      summary: skills.summary,
      latestVersion: skills.latestVersion,
      tags: skills.tags,
      updatedAt: skills.updatedAt,
    })
    .from(skills)
    .where(eq(skills.visibility, "public"))
    .orderBy(desc(skills.updatedAt));

  const matches = rows
    .map((row) => {
      const slug = row.slug.toLowerCase();
      const name = row.name.toLowerCase();
      const summary = row.summary?.toLowerCase() ?? "";
      const tags = Array.isArray(row.tags) ? row.tags.map((tag) => tag.toLowerCase()) : [];
      const score = computeLexicalScore({
        query,
        slug,
        name,
        summary,
        tags,
      });

      if (score <= 0) return null;

      return {
        id: row.id,
        slug: row.slug,
        name: row.name,
        summary: row.summary,
        latestVersion: row.latestVersion,
        tags: row.tags,
        updatedAt: row.updatedAt,
        score,
      };
    })
    .filter((row): row is NonNullable<typeof row> => row !== null)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return b.updatedAt.getTime() - a.updatedAt.getTime();
    })
    .slice(0, limit);

  return matches;
}

async function vectorSearch(query: string, limit: number) {
  const embedding = await generateEmbedding(query);
  if (!embedding) return [];

  const db = getDb();
  type VectorRow = {
    id: string;
    slug: string;
    name: string;
    summary: string | null;
    latest_version: string | null;
    tags: string[] | null;
    updated_at: Date;
    distance: number;
  };
  const vecStr = JSON.stringify(embedding);
  const result = await db.execute<VectorRow>(sql`
    SELECT s.id, s.slug, s.name, s.summary, s.latest_version, s.tags, s.updated_at,
      se.embedding <=> ${vecStr}::vector AS distance
    FROM skills s
    JOIN skill_embeddings se ON se.skill_id = s.id
    WHERE s.visibility = 'public'
    ORDER BY se.embedding <=> ${vecStr}::vector
    LIMIT ${limit}
  `);
  return result.rows;
}

interface SearchHit {
  id: string;
  slug: string;
  name: string;
  summary: string | null;
  latestVersion?: string | null;
  latest_version?: string | null;
  tags?: string[] | null;
  updatedAt?: Date | null;
  updated_at?: Date;
  rank?: number;
  distance?: number;
  score?: number;
}

function mergeSearchResults(fulltext: SearchHit[], vector: SearchHit[], limit: number) {
  const seen = new Set<string>();
  const merged: Array<{
    id: string;
    slug: string;
    name: string;
    summary: string | null;
    latestVersion: string | null;
    tags: string[] | null;
    updatedAt: Date | null;
    score: number;
  }> = [];

  for (const row of fulltext) {
    if (!seen.has(row.id)) {
      seen.add(row.id);
      merged.push({
        id: row.id,
        slug: row.slug,
        name: row.name,
        summary: row.summary,
        latestVersion: row.latestVersion ?? row.latest_version ?? null,
        tags: row.tags ?? null,
        updatedAt: row.updatedAt ?? row.updated_at ?? null,
        score: row.score ?? row.rank ?? 0,
      });
    }
  }

  for (const row of vector) {
    if (!seen.has(row.id)) {
      seen.add(row.id);
      merged.push({
        id: row.id,
        slug: row.slug,
        name: row.name,
        summary: row.summary,
        latestVersion: row.latest_version ?? null,
        tags: row.tags ?? null,
        updatedAt: row.updated_at ?? null,
        score: 1 / (1 + (row.distance ?? 1)),
      });
    }
  }

  return merged.sort((a, b) => b.score - a.score).slice(0, limit);
}

function computeLexicalScore(params: {
  query: string;
  slug: string;
  name: string;
  summary: string;
  tags: string[];
}) {
  const { query, slug, name, summary, tags } = params;
  let score = 0;

  if (slug === query) score += 120;
  else if (slug.startsWith(query)) score += 90;
  else if (slug.includes(query)) score += 60;

  if (name === query) score += 110;
  else if (name.startsWith(query)) score += 85;
  else if (name.includes(query)) score += 55;

  if (summary.includes(query)) score += 25;

  for (const tag of tags) {
    if (tag === query) score += 40;
    else if (tag.includes(query)) score += 20;
  }

  for (const token of query.split(/\s+/).filter(Boolean)) {
    if (token.length < 2) continue;
    if (slug.includes(token)) score += 18;
    if (name.includes(token)) score += 16;
    if (summary.includes(token)) score += 8;
    if (tags.some((tag) => tag.includes(token))) score += 8;
  }

  return score;
}

export async function generateEmbedding(text: string): Promise<number[] | null> {
  if (!OPENAI_API_KEY) return null;

  try {
    const res = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "text-embedding-3-small",
        input: text.slice(0, 8000),
      }),
    });
    const data = (await res.json()) as { data?: Array<{ embedding: number[] }> };
    return data.data?.[0]?.embedding ?? null;
  } catch (err) {
    console.error("Embedding generation failed:", err);
    return null;
  }
}

export async function storeEmbedding(skillId: string, embedding: number[]): Promise<void> {
  const db = getDb();
  await db.insert(skillEmbeddings).values({ skillId, embedding }).onConflictDoNothing();
}
