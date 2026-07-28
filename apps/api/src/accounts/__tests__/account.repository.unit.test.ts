import { describe, expect, it } from "vitest";

import { createMockDrizzleDb } from "../../test/mock-drizzle.js";
import { AccountRepository } from "../account.repository.js";

describe("AccountRepository Unit Tests", () => {
  const sampleAccountRow = {
    id: "123e4567-e89b-12d3-a456-426614174000",
    userId: "u1",
    name: "Savings",
    type: "bank",
    balanceMinor: 10000,
    currency: "INR",
    isArchived: false,
    openingBalanceMinor: 0,
    createdAt: new Date(),
    updatedAt: new Date()
  };

  it("create inserts account row", async () => {
    const mockDb = createMockDrizzleDb([sampleAccountRow]);
    const repo = new AccountRepository(mockDb);

    const res = await repo.create(
      "u1",
      {
        name: "Savings",
        type: "bank",
        openingBalanceMinor: 0
      },
      // @ts-expect-error mock tx
      mockDb
    );
    expect(res.name).toBe("Savings");
  });

  it("list returns non-archived accounts", async () => {
    const mockDb = createMockDrizzleDb([sampleAccountRow]);
    const repo = new AccountRepository(mockDb);

    const res = await repo.list("u1");
    expect(res).toHaveLength(1);
  });

  it("findById returns account or null", async () => {
    const mockDb = createMockDrizzleDb([sampleAccountRow]);
    const repo = new AccountRepository(mockDb);

    const res = await repo.findById("u1", sampleAccountRow.id);
    expect(res?.id).toBe(sampleAccountRow.id);
  });

  it("exists returns boolean indicating account presence", async () => {
    const mockDb = createMockDrizzleDb([{ id: sampleAccountRow.id }]);
    const repo = new AccountRepository(mockDb);

    const res = await repo.exists("u1", sampleAccountRow.id);
    expect(res).toBe(true);
  });

  it("applyBalanceDelta updates balance", async () => {
    const mockDb = createMockDrizzleDb([sampleAccountRow]);
    const repo = new AccountRepository(mockDb);

    // @ts-expect-error mock tx
    const res = await repo.applyBalanceDelta("u1", sampleAccountRow.id, 5000, mockDb);
    expect(res).toBe("applied");
  });

  it("applyReversalBalanceDelta updates balance even on archived accounts", async () => {
    const mockDb = createMockDrizzleDb([sampleAccountRow]);
    const repo = new AccountRepository(mockDb);

    // @ts-expect-error mock tx
    const res = await repo.applyReversalBalanceDelta("u1", sampleAccountRow.id, 5000, mockDb);
    expect(res).toBe("applied");
  });

  it("archive sets isArchived true", async () => {
    const mockDb = createMockDrizzleDb([{ id: sampleAccountRow.id }]);
    const repo = new AccountRepository(mockDb);

    // @ts-expect-error mock tx
    const res = await repo.archive("u1", sampleAccountRow.id, mockDb);
    expect(res).toBe(true);
  });
});
