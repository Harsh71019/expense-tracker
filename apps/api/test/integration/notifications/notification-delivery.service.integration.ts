import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { NotificationOutboxRepository } from "../../../src/notifications/notification-outbox.repository.js";
import { NotificationDeliveryService } from "../../../src/notifications/notification-delivery.service.js";
import type {
  NotificationAdapter,
  NotificationDelivery
} from "../../../src/notifications/notification-adapter.js";
import { withTxn } from "../../../src/common/db/db-txn.js";
import { createTestDb, insertTestUser } from "../support/postgres-test-db.js";
import type { TestDb } from "../support/postgres-test-db.js";

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
  let testDb: TestDb;
  let outbox: NotificationOutboxRepository;

  beforeAll(async () => {
    testDb = await createTestDb();
    for (const userId of ["user-1", "user-2", "user-3"]) {
      await insertTestUser(testDb.db, userId);
    }
    outbox = new NotificationOutboxRepository(testDb.db);
  });

  afterAll(async () => {
    await testDb.teardown();
  });

  it("sends via the adapter and marks the outbox entry sent", async () => {
    const adapter = new RecordingAdapter();
    const service = new NotificationDeliveryService(outbox, adapter);

    const entry = await withTxn(testDb.db, (tx) =>
      outbox.enqueue("user-1", "budget_alert", { budgetId: "b1" }, tx)
    );

    await service.deliver(entry.id);

    expect(adapter.sent).toEqual([
      { userId: "user-1", type: "budget_alert", payload: { budgetId: "b1" } }
    ]);
    const stored = await outbox.findById(entry.id);
    expect(stored?.status).toBe("sent");
    expect(stored?.sentAt).toBeInstanceOf(Date);
  });

  it("is a no-op when the notification no longer exists", async () => {
    const adapter = new RecordingAdapter();
    const service = new NotificationDeliveryService(outbox, adapter);

    await service.deliver("3fa85f64-5717-4562-b3fc-2c963f66beef");

    expect(adapter.sent).toEqual([]);
  });

  it("is a no-op when the notification is already sent (duplicate delivery job)", async () => {
    const adapter = new RecordingAdapter();
    const service = new NotificationDeliveryService(outbox, adapter);

    const entry = await withTxn(testDb.db, (tx) =>
      outbox.enqueue("user-2", "balance_drift", { accountId: "a1" }, tx)
    );
    await outbox.markSent(entry.id);

    await service.deliver(entry.id);

    expect(adapter.sent).toEqual([]);
  });

  it("propagates the adapter error and leaves the entry pending so BullMQ retries", async () => {
    const adapter = new RecordingAdapter();
    const service = new NotificationDeliveryService(outbox, adapter);

    const entry = await withTxn(testDb.db, (tx) =>
      outbox.enqueue("user-3", "monthly_report", { month: "2026-07" }, tx)
    );
    adapter.failNextCall();

    await expect(service.deliver(entry.id)).rejects.toThrow("adapter down");

    const stored = await outbox.findById(entry.id);
    expect(stored?.status).toBe("pending");
  });
});
