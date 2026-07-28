import { describe, expect, it } from "vitest";

import { createMockDrizzleDb } from "../../test/mock-drizzle.js";
import { NotificationOutboxRepository } from "../notification-outbox.repository.js";

describe("NotificationOutboxRepository Unit Tests", () => {
  const sampleNotificationRow = {
    id: "123e4567-e89b-12d3-a456-426614174000",
    userId: "u1",
    type: "budget_alert",
    payload: { title: "Alert", message: "Low balance" },
    status: "pending",
    sentAt: null,
    createdAt: new Date()
  };

  it("enqueue inserts notification row", async () => {
    const mockDb = createMockDrizzleDb([sampleNotificationRow]);
    const repo = new NotificationOutboxRepository(mockDb);

    await repo.enqueue(
      "u1",
      "budget_alert",
      { title: "Alert", message: "Low balance" },
      // @ts-expect-error mock tx
      mockDb
    );
    expect(mockDb.insert).toHaveBeenCalled();
  });

  it("findById returns notification or null", async () => {
    const mockDb = createMockDrizzleDb([sampleNotificationRow]);
    const repo = new NotificationOutboxRepository(mockDb);

    const res = await repo.findById("u1", sampleNotificationRow.id);
    expect(res?.id).toBe(sampleNotificationRow.id);
  });
});
