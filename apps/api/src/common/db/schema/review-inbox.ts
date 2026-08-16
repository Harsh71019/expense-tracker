import {
  bigint,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  type AnyPgColumn
} from "drizzle-orm/pg-core";

import { user } from "../auth-schema.js";
import { reviewItemSourceTypeEnum, reviewItemStatusEnum } from "./enums.js";

export const reviewInboxItems = pgTable(
  "review_inbox_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id),
    sourceType: reviewItemSourceTypeEnum("source_type").notNull(),
    sourceId: text("source_id").notNull(),
    sourceVersion: integer("source_version").notNull(),
    status: reviewItemStatusEnum("status").notNull().default("active"),
    priorityScore: integer("priority_score").notNull(),
    priorityFactors: jsonb("priority_factors").notNull(),
    title: text("title").notNull(),
    subtitle: text("subtitle").notNull(),
    amountMinor: bigint("amount_minor", { mode: "number" }),
    confidenceBps: integer("confidence_bps").notNull(),
    evidence: jsonb("evidence").notNull(),
    inputWatermark: jsonb("input_watermark").notNull(),
    supersedesItemId: uuid("supersedes_item_id").references((): AnyPgColumn => reviewInboxItems.id),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    dismissedAt: timestamp("dismissed_at", { withTimezone: true }),
    dismissReason: text("dismiss_reason"),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    feedbackAction: text("feedback_action"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull()
  },
  (table) => [
    uniqueIndex("review_inbox_user_source_version").on(
      table.userId,
      table.sourceType,
      table.sourceId,
      table.sourceVersion
    ),
    index("review_inbox_user_status_priority_cursor").on(
      table.userId,
      table.status,
      table.priorityScore.desc(),
      table.occurredAt.desc(),
      table.id
    ),
    index("review_inbox_user_status_source").on(table.userId, table.status, table.sourceType),
    index("review_inbox_user_supersedes").on(table.userId, table.supersedesItemId)
  ]
);
