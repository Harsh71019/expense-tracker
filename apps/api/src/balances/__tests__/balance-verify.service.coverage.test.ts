import { describe, expect, it, vi } from "vitest";

import { LogEvent } from "../../common/logging/events.js";
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
  const metrics = { recordBalanceVerification: vi.fn().mockResolvedValue(undefined) };
  const service = new BalanceVerifyService(
    focusedTestDouble(db),
    focusedTestDouble({ env: { SERVICE_ROLE: role } }),
    focusedTestDouble(balances),
    focusedTestDouble(outbox),
    focusedTestDouble(logger),
    focusedTestDouble(metrics)
  );
  return { service, balances, outbox, logger, metrics };
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
    expect(context.metrics.recordBalanceVerification).toHaveBeenCalledWith(0);
  });

  it("enqueues and logs detected drift", async () => {
    const context = createVerifier("worker", new Map([["account-1", 50]]));
    await context.service.verify();
    expect(context.outbox.enqueue).toHaveBeenCalled();
    expect(context.logger.error).toHaveBeenCalled();
    expect(context.metrics.recordBalanceVerification).toHaveBeenCalledWith(1);
  });

  it("does not retry completed verification work when the metric store is unavailable", async () => {
    const context = createVerifier("worker", new Map());
    context.metrics.recordBalanceVerification.mockRejectedValueOnce(new Error("Redis unavailable"));

    await expect(context.service.verify()).resolves.toBeUndefined();
    expect(context.logger.error).toHaveBeenCalledWith(
      expect.objectContaining({
        event: LogEvent.MetricsWriteFailed,
        metric: "balance_verification"
      }),
      "balance verification metric write failed"
    );
  });
});
