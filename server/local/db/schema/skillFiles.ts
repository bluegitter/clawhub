import { pgTable, uuid, text, integer, index } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { skillVersions } from "./skillVersions";

export const skillFiles = pgTable(
  "skill_files",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    versionId: uuid("version_id")
      .notNull()
      .references(() => skillVersions.id, { onDelete: "cascade" }),
    filename: text("filename").notNull(),
    storagePath: text("storage_path").notNull(),
    sha256: text("sha256"),
    size: integer("size").default(0),
  },
  (table) => [index("idx_sf_version").on(table.versionId)],
);

export const skillFilesRelations = relations(skillFiles, ({ one }) => ({
  version: one(skillVersions, { fields: [skillFiles.versionId], references: [skillVersions.id] }),
}));
