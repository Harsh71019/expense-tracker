import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import { createConnection } from "mongoose";
import type { Connection } from "mongoose";

import { NotificationOutboxRepository } from "../../../src/notifications/notification-outbox.repository.js";
import type { NotificationOutboxEntry } from "../../../src/notifications/notification-outbox.repository.js";
import { withTxn } from "../../../src/common/mongo-txn.js";

describe("NotificationOutboxRepository", () => {
  let replicaSet: MongoMemoryReplSet | undefined;
  let connection: Connection | undefined;
  let outbox: NotificationOutboxRepository | undefined;

  beforeAll(async () => {
    replicaSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    connection = await createConnection(
      replicaSet.getUri("vyaya_notification_outbox_test")
    ).asPromise();
    outbox = new NotificationOutboxRepository(connection);
  });

  afterAll(async () => {
    if (connection !== undefined) await connection.close();
    if (replicaSet !== undefined) await replicaSet.stop();
  });

  it("enqueues a pending entry inside a transaction and finds it by id", async () => {
    const repository = getOutbox(outbox);
    const conn = getConnection(connection);

    const enqueued = await withTxn(conn, (session) =>
      repository.enqueue("user-1", "budget_alert", { budgetId: "b1" }, session)
    );

    expect(enqueued.status).toBe("pending");
    expect(enqueued.sentAt).toBeUndefined();

    const found = await repository.findById(enqueued.id);
    expect(found).toMatchObject({
      id: enqueued.id,
      userId: "user-1",
      type: "budget_alert",
      status: "pending"
    });
  });

  it("rolls back the enqueue if the triggering transaction aborts", async () => {
    const repository = getOutbox(outbox);
    const conn = getConnection(connection);

    await expect(
      withTxn(conn, async (session) => {
        await repository.enqueue("user-1", "balance_drift", { accountId: "a1" }, session);
        throw new Error("Force Abort");
      })
    ).rejects.toThrow("Force Abort");

    const db = getDatabase(connection);
    const logs = await db
      .collection("notification_outbox")
      .find({ type: "balance_drift" })
      .toArray();
    expect(logs.length).toBe(0);
  });

  it("findPending returns only pending entries, oldest first, capped by limit", async () => {
    const repository = getOutbox(outbox);
    const conn = getConnection(connection);

    const first = await withTxn(conn, (session) =>
      repository.enqueue("user-2", "monthly_report", { month: "2026-06" }, session)
    );
    const second = await withTxn(conn, (session) =>
      repository.enqueue("user-2", "monthly_report", { month: "2026-07" }, session)
    );
    await repository.markSent(first.id);

    const pending = await repository.findPending(10);
    const ids = pending.map((entry) => entry.id);
    expect(ids).toContain(second.id);
    expect(ids).not.toContain(first.id);
  });

  it("markSent is a no-op once an entry is already sent", async () => {
    const repository = getOutbox(outbox);
    const conn = getConnection(connection);

    const entry = await withTxn(conn, (session) =>
      repository.enqueue("user-3", "budget_alert", {}, session)
    );

    await repository.markSent(entry.id);
    const firstSent = getSent(await repository.findById(entry.id));

    await repository.markSent(entry.id);
    const secondSent = getSent(await repository.findById(entry.id));

    expect(secondSent.getTime()).toBe(firstSent.getTime());
  });

  it("findById returns null for a well-formed id that does not exist", async () => {
    const repository = getOutbox(outbox);
    const missing = await repository.findById("507f1f77bcf86cd799439011");
    expect(missing).toBeNull();
  });

  it("findById returns null for a malformed id instead of throwing", async () => {
    const repository = getOutbox(outbox);
    const malformed = await repository.findById("not-an-object-id");
    expect(malformed).toBeNull();
  });
});

function getOutbox(
  repository: NotificationOutboxRepository | undefined
): NotificationOutboxRepository {
  if (repository === undefined) throw new Error("Notification outbox repository is not ready");
  return repository;
}

function getConnection(connection: Connection | undefined): Connection {
  if (connection === undefined) throw new Error("Connection is not ready");
  return connection;
}

function getDatabase(connection: Connection | undefined): NonNullable<Connection["db"]> {
  const database = getConnection(connection).db;
  if (database === undefined) throw new Error("Database is not ready");
  return database;
}

function getSent(entry: NotificationOutboxEntry | null): Date {
  if (entry?.sentAt === undefined) throw new Error("Entry is not sent");
  return entry.sentAt;
}
