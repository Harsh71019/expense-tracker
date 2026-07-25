import { describe, expect, it, vi } from "vitest";

import { createMockDrizzleDb } from "../../test/mock-drizzle.js";
import { BalanceVerifyRepository } from "../balance-verify.repository.js";

describe("BalanceVerifyRepository Unit Tests", () => {
  const sampleAccount = {
    id: "123e4567-e89b-12d3-a456-426614174000",
    userId: "u1",
    name: "Bank Account",
    type: "bank",
    currency: "INR",
    openingBalanceMinor: 1000,
    balanceMinor: 1500,
    isArchived: false,
    createdAt: new Date(),
    updatedAt: new Date()
  };

  it("findAllAccounts returns all non-archived accounts", async () => {
    const mockDb = createMockDrizzleDb([sampleAccount]);
    const repo = new BalanceVerifyRepository(mockDb);

    const res = await repo.findAllAccounts();
    expect(res).toHaveLength(1);
  });

  it("sumDeltasByAccount returns map of account balances deltas", async () => {
    const mockDb = createMockDrizzleDb([{ accountId: "acc_1", netMinor: "500" }]);
    // @ts-expect-error mock chaining
    mockDb.groupBy = vi.fn().mockReturnValue(mockDb);

    const repo = new BalanceVerifyRepository(mockDb);

    const res = await repo.sumDeltasByAccount();
    expect(res.get("acc_1")).toBe(500);
  });
});
