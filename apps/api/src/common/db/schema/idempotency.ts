import { jsonb, pgTable, primaryKey, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { user } from "../auth-schema.js";

export const idempotencyRecords = pgTable(
  "idempotency_records",
  {
    userId: text("user_id")
      .notNull()
      .references(() => user.id),
    operation: text("operation").notNull(),
    key: uuid("key").notNull(),
    // Not .notNull(): a JS `null` result (e.g. an archive/delete operation's
    // IdempotentResult<null>) is sent by the pg driver as SQL NULL for a
    // jsonb column, not the JSON `null` literal -- nullable here reflects
    // that reality rather than fighting it.
    result: jsonb("result"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull()
  },
  (table) => [primaryKey({ columns: [table.userId, table.operation, table.key] })]
);
