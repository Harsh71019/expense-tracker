import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import { createConnection } from "mongoose";
import type { Connection } from "mongoose";

import { NotificationOutboxRepository } from "../../../src/notifications/notification-outbox.repository.js";
import { NotificationDeliveryService } from "../../../src/notifications/notification-delivery.service.js";
import type {
  NotificationAdapter,
  NotificationDelivery
} from "../../../src/notifications/notification-adapter.js";
import { withTxn } from "../../../src/common/mongo-txn.js";

/** Records every send() call instead of hitting a real ntfy/Telegram channel. */
class RecordingAdapter implements NotificationAdapter {
  readonly sent: NotificationDelivery[] = [];
  private failNext = false;

  failNextCall(): void {
    this.failNext = true;
  }

  send(delivery: NotificationDelivery): Promise<void> {
    if (this.failNext) {
      this.failNext = false;
      return Promise.reject(new Error("adapter down"));
    }
    this.sent.push(delivery);
    return Promise.resolve();
  }
}

describe("NotificationDeliveryService", () => {
  let replicaSet: MongoMemoryReplSet | undefined;
  let connection: Connection | undefined;
  let outbox: NotificationOutboxRepository | undefined;

  beforeAll(async () => {
    replicaSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    connection = await createConnection(
      replicaSet.getUri("vyaya_notification_delivery_test")
    ).asPromise();
    outbox = new NotificationOutboxRepository(connection);
  });

  afterAll(async () => {
    if (connection !== undefined) await connection.close();
    if (replicaSet !== undefined) await replicaSet.stop();
  });

  it("sends via the adapter and marks the outbox entry sent", async () => {
    const repository = getOutbox(outbox);
    const conn = getConnection(connection);
    const adapter = new RecordingAdapter();
    const service = new NotificationDeliveryService(repository, adapter);

    const entry = await withTxn(conn, (session) =>
      repository.enqueue("user-1", "budget_alert", { budgetId: "b1" }, session)
    );

    await service.deliver(entry.id);

    expect(adapter.sent).toEqual([
      { userId: "user-1", type: "budget_alert", payload: { budgetId: "b1" } }
    ]);
    const stored = await repository.findById(entry.id);
    expect(stored?.status).toBe("sent");
    expect(stored?.sentAt).toBeInstanceOf(Date);
  });

  it("is a no-op when the notification no longer exists", async () => {
    const repository = getOutbox(outbox);
    const adapter = new RecordingAdapter();
    const service = new NotificationDeliveryService(repository, adapter);

    await service.deliver("507f1f77bcf86cd799439011");

    expect(adapter.sent).toEqual([]);
  });

  it("is a no-op when the notification is already sent (duplicate delivery job)", async () => {
    const repository = getOutbox(outbox);
    const conn = getConnection(connection);
    const adapter = new RecordingAdapter();
    const service = new NotificationDeliveryService(repository, adapter);

    const entry = await withTxn(conn, (session) =>
      repository.enqueue("user-2", "balance_drift", { accountId: "a1" }, session)
    );
    await repository.markSent(entry.id);

    await service.deliver(entry.id);

    expect(adapter.sent).toEqual([]);
  });

  it("propagates the adapter error and leaves the entry pending so BullMQ retries", async () => {
    const repository = getOutbox(outbox);
    const conn = getConnection(connection);
    const adapter = new RecordingAdapter();
    const service = new NotificationDeliveryService(repository, adapter);

    const entry = await withTxn(conn, (session) =>
      repository.enqueue("user-3", "monthly_report", { month: "2026-07" }, session)
    );
    adapter.failNextCall();

    await expect(service.deliver(entry.id)).rejects.toThrow("adapter down");

    const stored = await repository.findById(entry.id);
    expect(stored?.status).toBe("pending");
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
