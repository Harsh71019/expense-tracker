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
    paymentRail: "unknown" as const,
    counterpartyHandle: null,
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
      execute: vi.fn(async (_u, _op, _k, _intent, _s, work) => {
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

  it("delegates batch category assignment to idempotency service", async () => {
    const input = {
      transactionIds: ["3fa85f64-5717-4562-b3fc-2c963f66beef"],
      categoryId: "3fa85f64-5717-4562-b3fc-2c963f66be99"
    };
    const result = { ...input, updatedCount: 1 };
    // @ts-expect-error mock transaction service
    const mockTxService: TransactionService = {
      assignCategoryInTx: vi.fn(async () => result)
    };
    // @ts-expect-error mock idempotency service
    const mockIdempotency: IdempotencyPostgresService = {
      execute: vi.fn(async (_u, _op, _k, _intent, _schema, work) => ({
        result: await work("tx1"),
        replayed: false
      }))
    };

    const service = new TransactionMutationService(mockTxService, mockIdempotency);

    await expect(
      service.assignCategory("u1", input, "18181818-aaaa-4181-8181-181818181818")
    ).resolves.toEqual({ result, replayed: false });
    expect(mockIdempotency.execute).toHaveBeenCalledWith(
      "u1",
      "transaction.category.batch-assign",
      "18181818-aaaa-4181-8181-181818181818",
      input,
      expect.anything(),
      expect.any(Function)
    );
  });
});
