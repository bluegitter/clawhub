import { pgTable, uuid, text, integer, timestamp, index, uniqueIndex } from "drizzle-orm/pg-core";
import { skills } from "./skills";
import { skillVersions } from "./skillVersions";

export const skillDownloads = pgTable(
  "skill_downloads",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    skillId: uuid("skill_id")
      .notNull()
      .references(() => skills.id, { onDelete: "cascade" }),
    versionId: uuid("version_id").references(() => skillVersions.id, { onDelete: "set null" }),
    identityKey: text("identity_key").notNull(),
    hourBucket: integer("hour_bucket").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("idx_skill_downloads_unique_hour").on(
      table.skillId,
      table.identityKey,
      table.hourBucket,
    ),
    index("idx_skill_downloads_skill").on(table.skillId),
    index("idx_skill_downloads_version").on(table.versionId),
  ],
);
