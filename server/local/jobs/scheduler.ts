import { getDb } from "../db/index";
import { skills } from "../db/schema/index";
import { generateEmbedding, storeEmbedding } from "../services/search";
import { eq } from "drizzle-orm";

export async function scheduleEmbeddingGeneration(skillId: string): Promise<void> {
  await handleEmbeddingGeneration({ skillId }).catch((err) =>
    console.error("Embedding job failed:", err),
  );
}

interface EmbeddingJobData {
  skillId: string;
}

async function handleEmbeddingGeneration(data: EmbeddingJobData): Promise<void> {
  const db = getDb();
  const skill = await db.query.skills.findFirst({ where: eq(skills.id, data.skillId) });
  if (!skill) return;

  const text = [skill.name, skill.summary, skill.description].filter(Boolean).join(" ");
  if (!text.trim()) return;

  const embedding = await generateEmbedding(text);
  if (embedding) {
    await storeEmbedding(data.skillId, embedding);
  }
}
