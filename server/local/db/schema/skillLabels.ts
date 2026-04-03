import { pgTable, uuid, text, timestamp, index, uniqueIndex } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { skills } from "./skills";

export const skillLabels = pgTable(
  "skill_labels",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    skillId: uuid("skill_id")
      .notNull()
      .references(() => skills.id, { onDelete: "cascade" }),
    label: text("label").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("idx_skill_labels_skill_label_unique").on(table.skillId, table.label),
    index("idx_skill_labels_label").on(table.label),
    index("idx_skill_labels_skill").on(table.skillId),
  ],
);

export const skillLabelsRelations = relations(skillLabels, ({ one }) => ({
  skill: one(skills, { fields: [skillLabels.skillId], references: [skills.id] }),
}));
