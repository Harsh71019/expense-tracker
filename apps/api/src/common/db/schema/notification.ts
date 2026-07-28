import { index, integer, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { user } from "../auth-schema.js";
import { notificationStatusEnum, notificationTypeEnum } from "./enums.js";

export const notificationOutbox = pgTable(
  "notification_outbox",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id),
    type: notificationTypeEnum("type").notNull(),
    payload: jsonb("payload").notNull(),
    status: notificationStatusEnum("status").notNull(),
    failureCode: text("failure_code"),
    failedAt: timestamp("failed_at", { withTimezone: true }),
    deliveryAttempts: integer("delivery_attempts").notNull().default(0),
    claimToken: uuid("claim_token"),
    leaseUntil: timestamp("lease_until", { withTimezone: true }),
    attemptCount: integer("attempt_count").notNull().default(0),
    lastAttemptAt: timestamp("last_attempt_at", { withTimezone: true }),
    lastError: text("last_error"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    sentAt: timestamp("sent_at", { withTimezone: true })
  },
  (table) => [
    index("notification_outbox_status_created_at").on(table.status, table.createdAt),
    index("notification_outbox_delivery_ready").on(table.status, table.leaseUntil, table.createdAt),
    index("notification_outbox_user_id").on(table.userId)
  ]
);
