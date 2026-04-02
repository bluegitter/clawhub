import { pgTable, uuid, text, timestamp, index } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { users } from "./users";
import { skillVersions } from "./skillVersions";

export const skills = pgTable(
  "skills",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    slug: text("slug").notNull().unique(),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => users.id),
    name: text("name").notNull(),
    summary: text("summary"),
    description: text("description"),
    iconUrl: text("icon_url"),
    latestVersion: text("latest_version"),
    visibility: text("visibility").notNull().default("public"),
    tags: text("tags").array().default([]),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("idx_skills_owner").on(table.ownerId),
    index("idx_skills_updated").on(table.updatedAt),
    index("idx_skills_owner_visibility").on(table.ownerId, table.visibility),
  ],
);

export const skillsRelations = relations(skills, ({ one, many }) => ({
  owner: one(users, { fields: [skills.ownerId], references: [users.id] }),
  versions: many(skillVersions),
}));
