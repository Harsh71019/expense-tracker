import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

import { user } from "../auth-schema.js";

export const userProfiles = pgTable("user_profiles", {
  userId: text("user_id")
    .primaryKey()
    .references(() => user.id),
  displayName: text("display_name").notNull(),
  locale: text("locale").notNull().default("en-IN"),
  timezone: text("timezone").notNull().default("Asia/Kolkata"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull()
});
