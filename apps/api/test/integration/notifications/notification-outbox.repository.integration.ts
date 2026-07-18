import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";

import { NotificationOutboxRepository } from "../../../src/notifications/notification-outbox.repository.js";
import type { NotificationOutboxEntry } from "../../../src/notifications/notification-outbox.repository.js";
import { withTxn } from "../../../src/common/db/db-txn.js";
import { notificationOutbox } from "../../../src/common/db/schema/index.js";
import { createTestDb, insertTestUser } from "../support/postgres-test-db.js";
import type { TestDb } from "../support/postgres-test-db.js";

describe("NotificationOutboxRepository", () => {
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

  it("enqueues a pending entry inside a transaction and finds it by id", async () => {
    const enqueued = await withTxn(testDb.db, (tx) =>
      outbox.enqueue("user-1", "budget_alert", { budgetId: "b1" }, tx)
    );

    expect(enqueued.status).toBe("pending");
    expect(enqueued.sentAt).toBeUndefined();

    const found = await outbox.findById(enqueued.id);
    expect(found).toMatchObject({
      id: enqueued.id,
      userId: "user-1",
      type: "budget_alert",
      status: "pending"
    });
  });

  it("rolls back the enqueue if the triggering transaction aborts", async () => {
    await expect(
      withTxn(testDb.db, async (tx) => {
        await outbox.enqueue("user-1", "balance_drift", { accountId: "a1" }, tx);
        throw new Error("Force Abort");
      })
    ).rejects.toThrow("Force Abort");

    const logs = await testDb.db
      .select()
      .from(notificationOutbox)
      .where(eq(notificationOutbox.type, "balance_drift"));
    expect(logs.length).toBe(0);
  });

  it("findPending returns only pending entries, oldest first, capped by limit", async () => {
    const first = await withTxn(testDb.db, (tx) =>
      outbox.enqueue("user-2", "monthly_report", { month: "2026-06" }, tx)
    );
    const second = await withTxn(testDb.db, (tx) =>
      outbox.enqueue("user-2", "monthly_report", { month: "2026-07" }, tx)
    );
    await outbox.markSent(first.id);

    const pending = await outbox.findPending(10);
    const ids = pending.map((entry) => entry.id);
    expect(ids).toContain(second.id);
    expect(ids).not.toContain(first.id);
  });

  it("markSent is a no-op once an entry is already sent", async () => {
    const entry = await withTxn(testDb.db, (tx) =>
      outbox.enqueue("user-3", "budget_alert", {}, tx)
    );

    await outbox.markSent(entry.id);
    const firstSent = getSent(await outbox.findById(entry.id));

    await outbox.markSent(entry.id);
    const secondSent = getSent(await outbox.findById(entry.id));

    expect(secondSent.getTime()).toBe(firstSent.getTime());
  });

  it("findById returns null for a well-formed id that does not exist", async () => {
    const missing = await outbox.findById("3fa85f64-5717-4562-b3fc-2c963f66beef");
    expect(missing).toBeNull();
  });

  it("findById returns null for a malformed id instead of throwing", async () => {
    const malformed = await outbox.findById("not-an-object-id");
    expect(malformed).toBeNull();
  });
});

function getSent(entry: NotificationOutboxEntry | null): Date {
  if (entry?.sentAt === undefined) throw new Error("Entry is not sent");
  return entry.sentAt;
}
