import { describe, expect, it } from "vitest";

import { createMockDrizzleDb } from "../../test/mock-drizzle.js";
import { PendingTransactionRepository } from "../pending-transaction.repository.js";

describe("PendingTransactionRepository Unit Tests", () => {
  const sampleRow = {
    id: "123e4567-e89b-12d3-a456-426614174000",
    userId: "u1",
    accountId: "223e4567-e89b-12d3-a456-426614174000",
    type: "expense",
    occurredAt: new Date("2026-07-18T00:00:00.000Z"),
    description: "Anthropic — USD 23.60, INR amount pending",
    status: "pending",
    resultingTransactionId: null,
    createdAt: new Date(),
    updatedAt: new Date()
  };

  it("create inserts a pending transaction", async () => {
    const mockDb = createMockDrizzleDb([sampleRow]);
    const repo = new PendingTransactionRepository(mockDb);

    const res = await repo.create(
      "u1",
      {
        accountId: sampleRow.accountId,
        type: "expense",
        occurredAt: sampleRow.occurredAt,
        description: sampleRow.description
      },
      // @ts-expect-error mock tx
      mockDb
    );
    expect(res.description).toBe(sampleRow.description);
    expect(res.status).toBe("pending");
    expect(res.resultingTransactionId).toBeUndefined();
  });

  it("findById returns a pending transaction or null", async () => {
    const found = createMockDrizzleDb([sampleRow]);
    await expect(
      new PendingTransactionRepository(found).findById("u1", sampleRow.id)
    ).resolves.toMatchObject({ id: sampleRow.id });

    const missing = createMockDrizzleDb([]);
    await expect(
      new PendingTransactionRepository(missing).findById("u1", sampleRow.id)
    ).resolves.toBeNull();
  });

  it("list returns pending transactions for the requested status", async () => {
    const mockDb = createMockDrizzleDb([sampleRow]);
    const repo = new PendingTransactionRepository(mockDb);

    const res = await repo.list("u1", "pending");
    expect(res).toHaveLength(1);
  });

  it("markConfirmed returns the updated row or null when already resolved", async () => {
    const confirmedRow = {
      ...sampleRow,
      status: "confirmed",
      resultingTransactionId: "323e4567-e89b-12d3-a456-426614174000"
    };
    const success = createMockDrizzleDb([confirmedRow]);
    await expect(
      new PendingTransactionRepository(success).markConfirmed(
        "u1",
        sampleRow.id,
        "323e4567-e89b-12d3-a456-426614174000",
        // @ts-expect-error mock tx
        success
      )
    ).resolves.toMatchObject({
      status: "confirmed",
      resultingTransactionId: "323e4567-e89b-12d3-a456-426614174000"
    });

    const alreadyResolved = createMockDrizzleDb([]);
    await expect(
      new PendingTransactionRepository(alreadyResolved).markConfirmed(
        "u1",
        sampleRow.id,
        "323e4567-e89b-12d3-a456-426614174000",
        // @ts-expect-error mock tx
        alreadyResolved
      )
    ).resolves.toBeNull();
  });

  it("markDismissed returns the updated row or null when already resolved", async () => {
    const dismissedRow = { ...sampleRow, status: "dismissed" };
    const success = createMockDrizzleDb([dismissedRow]);
    await expect(
      // @ts-expect-error mock tx
      new PendingTransactionRepository(success).markDismissed("u1", sampleRow.id, success)
    ).resolves.toMatchObject({ status: "dismissed" });

    const alreadyResolved = createMockDrizzleDb([]);
    await expect(
      new PendingTransactionRepository(alreadyResolved).markDismissed(
        "u1",
        sampleRow.id,
        // @ts-expect-error mock tx
        alreadyResolved
      )
    ).resolves.toBeNull();
  });
});
