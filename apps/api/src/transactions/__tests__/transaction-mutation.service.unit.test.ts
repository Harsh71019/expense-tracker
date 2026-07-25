import { describe, expect, it, vi } from "vitest";

import type { IdempotencyPostgresService } from "../../common/idempotency/idempotency-postgres.service.js";
import { TransactionMutationService } from "../transaction-mutation.service.js";
import type { TransactionService } from "../transaction.service.js";

describe("TransactionMutationService Unit Tests", () => {
  const sampleTx = {
    id: "tx_123",
    userId: "u1",
    accountId: "acc_1",
    type: "expense" as const,
    status: "posted" as const,
    amountMinor: 5000,
    currency: "INR" as const,
    source: "manual" as const,
    occurredAt: new Date("2026-01-01"),
    description: "Coffee",
    tags: [],
    createdAt: new Date(),
    updatedAt: new Date()
  };

  it("delegates update to idempotency service", async () => {
    // @ts-expect-error mock transaction service
    const mockTxService: TransactionService = {
      updateInTx: vi.fn(async () => sampleTx)
    };
    // @ts-expect-error mock idempotency service
    const mockIdempotency: IdempotencyPostgresService = {
      execute: vi.fn(async (_u, _op, _k, _s, work) => {
        const result = await work("tx1");
        return { result, replayed: false };
      })
    };

    const mutationService = new TransactionMutationService(mockTxService, mockIdempotency);

    const res = await mutationService.update(
      "u1",
      "tx_123",
      { description: "Coffee & Snacks" },
      "key1"
    );

    expect(res.result.id).toBe("tx_123");
    expect(res.replayed).toBe(false);
  });
});
