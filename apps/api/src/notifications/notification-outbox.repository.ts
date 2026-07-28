import { Inject, Injectable } from "@nestjs/common";
import { and, asc, eq, isNotNull, isNull, lte, or, sql } from "drizzle-orm";
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
export const NotificationTypeSchema = z.enum([
  "budget_alert",
  "monthly_report",
  "balance_drift",
  "goal_achieved"
]);
export type NotificationType = z.infer<typeof NotificationTypeSchema>;

const NotificationOutboxSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().min(1),
  type: NotificationTypeSchema,
  payload: z.record(z.string(), z.unknown()),
  status: z.enum(["pending", "delivering", "sent"]),
  failureCode: z.literal("delivery_retries_exhausted").optional(),
  failedAt: z.date().optional(),
  deliveryAttempts: z.number().int().min(0),
  claimToken: z.string().uuid().optional(),
  leaseUntil: z.date().optional(),
  attemptCount: z.number().int().nonnegative(),
  lastAttemptAt: z.date().optional(),
  lastError: z.string().optional(),
  createdAt: z.date(),
  sentAt: z.date().optional()
});
export type NotificationOutboxEntry = z.infer<typeof NotificationOutboxSchema>;
export type ClaimedNotification = NotificationOutboxEntry & Readonly<{ claimToken: string }>;

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

  async findById(userId: string, id: string): Promise<NotificationOutboxEntry | null> {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) return null;
    const [row] = await this.db
      .select()
      .from(notificationOutbox)
      .where(and(eq(notificationOutbox.userId, userId), eq(notificationOutbox.id, id)));
    return row === undefined ? null : toEntry(row);
  }

  /**
   * Worker-only system discovery. It returns the owning userId so every
   * delivery mutation can remain tenant-scoped.
   */
  async systemFindDispatchable(now: Date, limit: number): Promise<NotificationOutboxEntry[]> {
    const rows = await this.db
      .select()
      .from(notificationOutbox)
      .where(
        and(
          isNull(notificationOutbox.failedAt),
          or(
            eq(notificationOutbox.status, "pending"),
            and(
              eq(notificationOutbox.status, "delivering"),
              or(isNull(notificationOutbox.leaseUntil), lte(notificationOutbox.leaseUntil, now))
            )
          )
        )
      )
      .orderBy(asc(notificationOutbox.createdAt))
      .limit(limit);
    return rows.map(toEntry);
  }

  async claimForDelivery(
    userId: string,
    id: string,
    claimToken: string,
    now: Date,
    leaseUntil: Date
  ): Promise<ClaimedNotification | null> {
    const [row] = await this.db
      .update(notificationOutbox)
      .set({
        status: "delivering",
        claimToken,
        leaseUntil,
        attemptCount: sql`${notificationOutbox.attemptCount} + 1`,
        lastAttemptAt: now,
        lastError: null
      })
      .where(
        and(
          eq(notificationOutbox.userId, userId),
          eq(notificationOutbox.id, id),
          isNull(notificationOutbox.failedAt),
          or(
            eq(notificationOutbox.status, "pending"),
            and(
              eq(notificationOutbox.status, "delivering"),
              or(isNull(notificationOutbox.leaseUntil), lte(notificationOutbox.leaseUntil, now))
            )
          )
        )
      )
      .returning();
    if (row === undefined) return null;
    const entry = toEntry(row);
    if (entry.claimToken === undefined) {
      throw new Error("Claimed notification did not return its claim token.");
    }
    return { ...entry, claimToken: entry.claimToken };
  }

  async markSent(userId: string, id: string, claimToken: string): Promise<boolean> {
    const rows = await this.db
      .update(notificationOutbox)
      .set({
        status: "sent",
        claimToken: null,
        leaseUntil: null,
        lastError: null,
        sentAt: new Date()
      })
      .where(
        and(
          eq(notificationOutbox.userId, userId),
          eq(notificationOutbox.id, id),
          eq(notificationOutbox.status, "delivering"),
          eq(notificationOutbox.claimToken, claimToken)
        )
      )
      .returning({ id: notificationOutbox.id });
    return rows.length === 1;
  }

  async releaseFailed(
    userId: string,
    id: string,
    claimToken: string,
    errorSummary: string
  ): Promise<void> {
    await this.db
      .update(notificationOutbox)
      .set({
        status: "pending",
        claimToken: null,
        leaseUntil: null,
        lastError: errorSummary.slice(0, 500)
      })
      .where(
        and(
          eq(notificationOutbox.userId, userId),
          eq(notificationOutbox.id, id),
          eq(notificationOutbox.status, "delivering"),
          eq(notificationOutbox.claimToken, claimToken)
        )
      );
  }

  async markTerminalFailure(userId: string, id: string, attempts: number): Promise<void> {
    await this.db
      .update(notificationOutbox)
      .set({
        status: "pending",
        failureCode: "delivery_retries_exhausted",
        failedAt: new Date(),
        deliveryAttempts: attempts,
        claimToken: null,
        leaseUntil: null
      })
      .where(
        and(
          eq(notificationOutbox.userId, userId),
          eq(notificationOutbox.id, id),
          or(
            eq(notificationOutbox.status, "pending"),
            eq(notificationOutbox.status, "delivering")
          ),
          isNull(notificationOutbox.failedAt)
        )
      );
  }

  async requeueTerminalFailure(userId: string, id: string): Promise<boolean> {
    const rows = await this.db
      .update(notificationOutbox)
      .set({ failureCode: null, failedAt: null, deliveryAttempts: 0 })
      .where(
        and(
          eq(notificationOutbox.userId, userId),
          eq(notificationOutbox.id, id),
          eq(notificationOutbox.status, "pending"),
          isNotNull(notificationOutbox.failedAt)
        )
      )
      .returning({ id: notificationOutbox.id });
    return rows.length === 1;
  }
}

function toEntry(row: typeof notificationOutbox.$inferSelect): NotificationOutboxEntry {
  return NotificationOutboxSchema.parse(stripNulls(row));
}
