import { boolean, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

import { user } from "../auth-schema.js";
import { categoryKindEnum } from "./enums.js";

export const categories = pgTable(
  "categories",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id),
    name: text("name").notNull(),
    kind: categoryKindEnum("kind").notNull(),
    parentId: uuid("parent_id"),
    icon: text("icon"),
    color: text("color"),
    isArchived: boolean("is_archived").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull()
  },
  (table) => [
    uniqueIndex("categories_user_id_parent_id_name_unique").on(
      table.userId,
      table.parentId,
      table.name
    )
  ]
);
