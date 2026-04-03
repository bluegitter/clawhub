import { pgTable, uuid, timestamp, index, uniqueIndex } from "drizzle-orm/pg-core";
import { users } from "./users";
import { skills } from "./skills";

export const stars = pgTable(
  "stars",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    skillId: uuid("skill_id")
      .notNull()
      .references(() => skills.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("idx_stars_user_skill_unique").on(table.userId, table.skillId),
    index("idx_stars_user").on(table.userId),
    index("idx_stars_skill").on(table.skillId),
  ],
);
