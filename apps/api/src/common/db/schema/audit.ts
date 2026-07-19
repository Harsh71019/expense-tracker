import { index, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { user } from "../auth-schema.js";

export const auditLog = pgTable(
  "audit_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id),
    action: text("action").notNull(),
    entityId: text("entity_id").notNull(),
    meta: jsonb("meta"),
    at: timestamp("at", { withTimezone: true }).notNull()
  },
  (table) => [index("audit_log_user_id_at").on(table.userId, table.at.desc())]
);
