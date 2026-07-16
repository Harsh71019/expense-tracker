import { Injectable } from "@nestjs/common";
import { InjectConnection } from "@nestjs/mongoose";
import { Types } from "mongoose";
import type { Connection } from "mongoose";
import { z } from "zod";

import type { MongoSession } from "../common/mongo-txn.js";

const NOTIFICATION_OUTBOX_COLLECTION = "notification_outbox";

/**
 * Not exposed via packages/shared — the outbox is an internal delivery
 * mechanism, not a public API resource (no user-facing CRUD exists or is
 * planned for it).
 */
export const NotificationTypeSchema = z.enum(["budget_alert", "monthly_report", "balance_drift"]);
export type NotificationType = z.infer<typeof NotificationTypeSchema>;

const NotificationOutboxSchema = z.object({
  id: z.string(),
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
  constructor(@InjectConnection() private readonly connection: Connection) {}

  /**
   * BACKEND.md §14 / AGENTS.md §4: written inside the same transaction as
   * the state change that triggered it — pass the triggering write's own
   * session so the alert can never survive a rollback, and never gets
   * lost to a crash after the state change commits.
   */
  async enqueue(
    userId: string,
    type: NotificationType,
    payload: Record<string, unknown>,
    session: MongoSession
  ): Promise<NotificationOutboxEntry> {
    const document = {
      userId,
      type,
      payload,
      status: "pending" as const,
      createdAt: new Date()
    };
    const result = await this.database()
      .collection(NOTIFICATION_OUTBOX_COLLECTION)
      .insertOne(document, { session });
    return this.toEntry({ _id: result.insertedId, ...document });
  }

  async findById(id: string): Promise<NotificationOutboxEntry | null> {
    if (!/^[a-f\d]{24}$/i.test(id)) return null;
    const entry = await this.database()
      .collection(NOTIFICATION_OUTBOX_COLLECTION)
      .findOne({ _id: new Types.ObjectId(id) });
    return entry === null ? null : this.toEntry(entry);
  }

  /** The sweep's source of work — oldest first, so a backlog drains in order. */
  async findPending(limit: number): Promise<NotificationOutboxEntry[]> {
    const entries = await this.database()
      .collection(NOTIFICATION_OUTBOX_COLLECTION)
      .find({ status: "pending" })
      .sort({ createdAt: 1 })
      .limit(limit)
      .toArray();
    return entries.map((entry) => this.toEntry(entry));
  }

  async markSent(id: string): Promise<void> {
    await this.database()
      .collection(NOTIFICATION_OUTBOX_COLLECTION)
      .updateOne(
        { _id: new Types.ObjectId(id), status: "pending" },
        { $set: { status: "sent", sentAt: new Date() } }
      );
  }

  private toEntry(value: Record<string, unknown>): NotificationOutboxEntry {
    const { _id, ...rest } = value;
    return NotificationOutboxSchema.parse({ id: objectIdString(_id), ...rest });
  }

  private database(): NonNullable<Connection["db"]> {
    const database = this.connection.db;
    if (database === undefined) {
      throw new Error("MongoDB connection is not ready");
    }
    return database;
  }
}

function objectIdString(value: unknown): string {
  if (typeof value !== "object" || value === null || !("toString" in value)) {
    throw new Error("MongoDB document contains an invalid ObjectId.");
  }
  const stringify = value.toString;
  if (typeof stringify !== "function") {
    throw new Error("MongoDB document contains an invalid ObjectId.");
  }
  return stringify.call(value);
}
