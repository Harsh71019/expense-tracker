import { describe, expect, it, vi } from "vitest";

import { createMockConfig } from "../../test/mock-config.js";
import { BalanceVerifyService } from "../balance-verify.service.js";

describe("BalanceVerifyService Unit Tests", () => {
  it("verify checks all account balances against transaction deltas on worker role", async () => {
    const mockDb = {
      transaction: vi.fn(async (cb: (tx: string) => Promise<unknown>) => cb("tx1"))
    };

    const mockConfig = createMockConfig("worker");

    const sampleAccount = {
      id: "acc_1",
      userId: "u1",
      name: "Checking",
      openingBalanceMinor: 1000,
      balanceMinor: 1500
    };

    const mockBalancesRepo = {
      findAllAccounts: vi.fn(async () => [sampleAccount]),
      sumDeltasByAccount: vi.fn(async () => new Map([["acc_1", 500]]))
    };

    const mockOutbox = {
      enqueue: vi.fn(async () => undefined)
    };

    const mockLogger = { log: vi.fn(), error: vi.fn() };

    // @ts-expect-error mock service args
    const service = new BalanceVerifyService(
      mockDb,
      mockConfig,
      mockBalancesRepo,
      mockOutbox,
      mockLogger
    );

    await service.verify();

    expect(mockBalancesRepo.findAllAccounts).toHaveBeenCalled();
    expect(mockBalancesRepo.sumDeltasByAccount).toHaveBeenCalled();
    expect(mockOutbox.enqueue).not.toHaveBeenCalled();
    expect(mockLogger.log).toHaveBeenCalled();
  });
});
