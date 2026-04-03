import { pgTable, uuid, text, timestamp, index, uniqueIndex } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { skills } from "./skills";
import { skillVersions } from "./skillVersions";

export const skillVersionTags = pgTable(
  "skill_version_tags",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    skillId: uuid("skill_id")
      .notNull()
      .references(() => skills.id, { onDelete: "cascade" }),
    versionId: uuid("version_id")
      .notNull()
      .references(() => skillVersions.id, { onDelete: "cascade" }),
    tag: text("tag").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("idx_svt_skill_tag_unique").on(table.skillId, table.tag),
    index("idx_svt_version").on(table.versionId),
    index("idx_svt_skill").on(table.skillId),
  ],
);

export const skillVersionTagsRelations = relations(skillVersionTags, ({ one }) => ({
  skill: one(skills, { fields: [skillVersionTags.skillId], references: [skills.id] }),
  version: one(skillVersions, { fields: [skillVersionTags.versionId], references: [skillVersions.id] }),
}));
