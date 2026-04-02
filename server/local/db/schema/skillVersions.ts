import { pgTable, uuid, text, integer, timestamp, index } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { skills } from "./skills";
import { skillFiles } from "./skillFiles";

export const skillVersions = pgTable(
  "skill_versions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    skillId: uuid("skill_id")
      .notNull()
      .references(() => skills.id, { onDelete: "cascade" }),
    version: text("version").notNull(),
    changelog: text("changelog"),
    fileSize: integer("file_size").default(0),
    fileCount: integer("file_count").default(0),
    storagePath: text("storage_path").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("idx_sv_skill_version").on(table.skillId, table.version),
    index("idx_sv_skill").on(table.skillId),
  ],
);

export const skillVersionsRelations = relations(skillVersions, ({ one, many }) => ({
  skill: one(skills, { fields: [skillVersions.skillId], references: [skills.id] }),
  files: many(skillFiles),
}));
