import type { Transaction } from "@treasury-ops/shared";
import { describe, expect, it, vi } from "vitest";

import { createMockConfig } from "../../test/mock-config.js";
import { focusedTestDouble } from "../../test/mock-drizzle.js";
import { RecurringReconciliationSweepService } from "../recurring-reconciliation-sweep.service.js";

const NOW = new Date("2026-08-12T00:00:00.000Z");

function incoming(id: string, userId: string): Transaction {
  return {
    id,
    userId,
    accountId: "11111111-1111-4111-8111-111111111111",
    type: "expense",
    amountMinor: 199_900,
    currency: "INR",
    occurredAt: NOW,
    description: "CARD/DR/EMANDATE/Test merchant/mandate:testReference123",
    tags: [],
    source: "api",
    status: "posted",
    paymentRail: "card",
    counterpartyHandle: null,
    createdAt: NOW,
    updatedAt: NOW
  };
}

describe("RecurringReconciliationSweepService", () => {
  it("is a hard no-op in the API process", async () => {
    const transactions = {
      systemFindRecentUnreconciledApiTransactions: vi.fn(async () => [])
    };
    const reconciliation = { reconcileIncoming: vi.fn(async () => undefined) };
    const logger = { log: vi.fn(), error: vi.fn() };
    const service = new RecurringReconciliationSweepService(
      createMockConfig("api"),
      focusedTestDouble(transactions),
      focusedTestDouble(reconciliation),
      focusedTestDouble(logger)
    );

    await service.sweep();

    expect(transactions.systemFindRecentUnreconciledApiTransactions).not.toHaveBeenCalled();
    expect(reconciliation.reconcileIncoming).not.toHaveBeenCalled();
  });

  it("preserves each discovered tenant and isolates item failures", async () => {
    const first = incoming("22222222-2222-4222-8222-222222222222", "user-a");
    const second = incoming("33333333-3333-4333-8333-333333333333", "user-b");
    const transactions = {
      systemFindRecentUnreconciledApiTransactions: vi.fn(async () => [first, second])
    };
    const failure = new Error("first failed");
    const reconciliation = {
      reconcileIncoming: vi.fn().mockRejectedValueOnce(failure).mockResolvedValueOnce(undefined)
    };
    const logger = { log: vi.fn(), error: vi.fn() };
    const service = new RecurringReconciliationSweepService(
      createMockConfig("worker"),
      focusedTestDouble(transactions),
      focusedTestDouble(reconciliation),
      focusedTestDouble(logger)
    );

    await service.sweep();

    expect(reconciliation.reconcileIncoming).toHaveBeenNthCalledWith(1, "user-a", first);
    expect(reconciliation.reconcileIncoming).toHaveBeenNthCalledWith(2, "user-b", second);
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ txnId: first.id, err: failure }),
      "recurring reconciliation sweep item failed"
    );
  });
});
