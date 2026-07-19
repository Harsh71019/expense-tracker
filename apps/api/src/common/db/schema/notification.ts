import { index, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

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
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    sentAt: timestamp("sent_at", { withTimezone: true })
  },
  (table) => [
    index("notification_outbox_status_created_at").on(table.status, table.createdAt),
    index("notification_outbox_user_id").on(table.userId)
  ]
);
