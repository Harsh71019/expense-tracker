import { sql } from "drizzle-orm";
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
    // A plain unique index on (userId, parentId, name) treats every NULL parentId as
    // distinct, so it never rejects two root categories (parentId IS NULL) with the same
    // name -- split into two partial indexes: one for categories under a real parent, one
    // for root categories, each enforcing uniqueness within its own scope.
    uniqueIndex("categories_user_id_parent_id_name_unique")
      .on(table.userId, table.parentId, table.name)
      .where(sql`${table.parentId} IS NOT NULL`),
    uniqueIndex("categories_user_id_name_root_unique")
      .on(table.userId, table.name)
      .where(sql`${table.parentId} IS NULL`)
  ]
);
