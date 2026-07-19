import { Inject, Injectable } from "@nestjs/common";
import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";

import { DATABASE_CONNECTION } from "../common/db/db.module.js";
import type { DrizzleDb } from "../common/db/db.module.js";
import { notificationOutbox } from "../common/db/schema/index.js";
import { stripNulls } from "../common/db/strip-nulls.js";
import type { DbTx } from "../common/db/db-txn.js";

/**
 * Not exposed via packages/shared — the outbox is an internal delivery
 * mechanism, not a public API resource (no user-facing CRUD exists or is
 * planned for it).
 */
export const NotificationTypeSchema = z.enum(["budget_alert", "monthly_report", "balance_drift"]);
export type NotificationType = z.infer<typeof NotificationTypeSchema>;

const NotificationOutboxSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().min(1),
  type: NotificationTypeSchema,
  payload: z.record(z.string(), z.unknown()),
  status: z.enum(["pending", "sent"]),
  createdAt: z.date(),
  sentAt: z.date().optional()
});
export type NotificationOutboxEntry = z.infer<typeof NotificationOutboxSchema>;

@Injectable()
export class NotificationOutboxRepository {
  constructor(@Inject(DATABASE_CONNECTION) private readonly db: DrizzleDb) {}

  /**
   * BACKEND.md §14 / AGENTS.md §4: written inside the same transaction as
   * the state change that triggered it — pass the triggering write's own
   * tx so the alert can never survive a rollback, and never gets lost to a
   * crash after the state change commits.
   */
  async enqueue(
    userId: string,
    type: NotificationType,
    payload: Record<string, unknown>,
    tx: DbTx
  ): Promise<NotificationOutboxEntry> {
    const [row] = await tx
      .insert(notificationOutbox)
      .values({ userId, type, payload, status: "pending", createdAt: new Date() })
      .returning();
    if (row === undefined) throw new Error("Notification outbox insert did not return a row.");
    return toEntry(row);
  }

  async findById(id: string): Promise<NotificationOutboxEntry | null> {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) return null;
    const [row] = await this.db
      .select()
      .from(notificationOutbox)
      .where(eq(notificationOutbox.id, id));
    return row === undefined ? null : toEntry(row);
  }

  /** The sweep's source of work — oldest first, so a backlog drains in order. */
  async findPending(limit: number): Promise<NotificationOutboxEntry[]> {
    const rows = await this.db
      .select()
      .from(notificationOutbox)
      .where(eq(notificationOutbox.status, "pending"))
      .orderBy(asc(notificationOutbox.createdAt))
      .limit(limit);
    return rows.map(toEntry);
  }

  /** Guarded by status: a duplicate delivery job marking an already-sent entry must not re-stamp sentAt. */
  async markSent(id: string): Promise<void> {
    await this.db
      .update(notificationOutbox)
      .set({ status: "sent", sentAt: new Date() })
      .where(and(eq(notificationOutbox.id, id), eq(notificationOutbox.status, "pending")));
  }
}

function toEntry(row: typeof notificationOutbox.$inferSelect): NotificationOutboxEntry {
  return NotificationOutboxSchema.parse(stripNulls(row));
}
