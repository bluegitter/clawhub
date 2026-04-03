import { pgTable, uuid, text, timestamp, uniqueIndex, index } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { skills } from "./skills";

export const skillAliases = pgTable(
  "skill_aliases",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sourceSlug: text("source_slug").notNull(),
    targetSkillId: uuid("target_skill_id")
      .notNull()
      .references(() => skills.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("idx_skill_aliases_source_slug_unique").on(table.sourceSlug),
    index("idx_skill_aliases_target_skill").on(table.targetSkillId),
  ],
);

export const skillAliasesRelations = relations(skillAliases, ({ one }) => ({
  targetSkill: one(skills, { fields: [skillAliases.targetSkillId], references: [skills.id] }),
}));
