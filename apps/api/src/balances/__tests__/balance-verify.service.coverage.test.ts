import { describe, expect, it, vi } from "vitest";

import { focusedTestDouble } from "../../test/mock-drizzle.js";
import { BalanceVerifyService } from "../balance-verify.service.js";

function createVerifier(role: "api" | "worker", deltas: ReadonlyMap<string, number>) {
  const db = { transaction: vi.fn(async (work: (value: object) => Promise<unknown>) => work({})) };
  const balances = {
    findAllAccounts: vi.fn().mockResolvedValue([
      {
        id: "account-1",
        userId: "u1",
        name: "Bank",
        openingBalanceMinor: 100,
        balanceMinor: 100
      }
    ]),
    sumDeltasByAccount: vi.fn().mockResolvedValue(deltas)
  };
  const outbox = { enqueue: vi.fn().mockResolvedValue({}) };
  const logger = { log: vi.fn(), error: vi.fn() };
  const service = new BalanceVerifyService(
    focusedTestDouble(db),
    focusedTestDouble({ env: { SERVICE_ROLE: role } }),
    focusedTestDouble(balances),
    focusedTestDouble(outbox),
    focusedTestDouble(logger)
  );
  return { service, balances, outbox, logger };
}

describe("BalanceVerifyService edge coverage", () => {
  it("does nothing on the API process", async () => {
    const context = createVerifier("api", new Map());
    await context.service.verify();
    expect(context.balances.findAllAccounts).not.toHaveBeenCalled();
  });

  it("uses zero for a missing delta and skips balanced accounts", async () => {
    const context = createVerifier("worker", new Map());
    await context.service.verify();
    expect(context.outbox.enqueue).not.toHaveBeenCalled();
    expect(context.logger.log).toHaveBeenCalledWith(
      expect.objectContaining({ accountCount: 1, driftCount: 0 }),
      "balance verification complete"
    );
  });

  it("enqueues and logs detected drift", async () => {
    const context = createVerifier("worker", new Map([["account-1", 50]]));
    await context.service.verify();
    expect(context.outbox.enqueue).toHaveBeenCalled();
    expect(context.logger.error).toHaveBeenCalled();
  });
});
