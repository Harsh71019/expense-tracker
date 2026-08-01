import { describe, expect, it, vi } from "vitest";

import { InvalidReconciliationResolutionError } from "../../common/errors/invalid-reconciliation-resolution.error.js";
import { ReconciliationAlreadyResolvedError } from "../../common/errors/reconciliation-already-resolved.error.js";
import { EntityNotFoundError } from "../../common/errors/entity-not-found.error.js";
import { RecurringReconciliationService } from "../recurring-reconciliation.service.js";

const ACCOUNT_ID = "3fa85f64-5717-4562-b3fc-2c963f66beef";
const RULE_ID = "11111111-1111-4111-8111-111111111111";
const RECURRING_TXN_ID = "22222222-2222-4222-8222-222222222222";
const OTHER_RECURRING_TXN_ID = "33333333-3333-4333-8333-333333333333";
const INCOMING_TXN_ID = "44444444-4444-4444-8444-444444444444";

const incomingTransaction = {
  id: INCOMING_TXN_ID,
  userId: "user-a",
  accountId: ACCOUNT_ID,
  categoryId: undefined,
  type: "expense" as const,
  amountMinor: 200_000,
  currency: "INR" as const,
  occurredAt: new Date("2026-08-01T00:00:00.000Z"),
  description: "Claude subscription",
  tags: [],
  source: "api" as const,
  status: "posted" as const,
  createdAt: new Date(),
  updatedAt: new Date()
};

function buildService(overrides: {
  candidates?: unknown[];
  transactions?: Record<string, unknown>;
  reconciliations?: Record<string, unknown>;
  notifications?: Record<string, unknown>;
}) {
  const db = {
    transaction: vi.fn((operation: (tx: string) => Promise<unknown>) => operation("tx1"))
  };
  const transactions = {
    reverseInTx: vi.fn(async () => undefined),
    ...overrides.transactions
  };
  const reconciliations = {
    findUnreconciledRecurringCandidates: vi.fn(async () => overrides.candidates ?? []),
    create: vi.fn(async () => undefined),
    findById: vi.fn(async () => null),
    resolve: vi.fn(async (userId: string, id: string, resolution: string) => ({
      id,
      userId,
      resolution
    })),
    ...overrides.reconciliations
  };
  const notifications = { enqueue: vi.fn(async () => undefined), ...overrides.notifications };
  const audit = { record: vi.fn(async () => undefined) };
  const idempotency = {
    execute: vi.fn(
      async (
        _u: string,
        _op: string,
        _k: string,
        _intent: unknown,
        _s: unknown,
        work: (tx: string) => Promise<unknown>
      ) => {
        const result = await work("tx1");
        return { result, replayed: false };
      }
    )
  };
  const logger = { log: vi.fn(), error: vi.fn() };

  const service = new RecurringReconciliationService(
    // @ts-expect-error mock db for unit testing
    db,
    transactions,
    reconciliations,
    notifications,
    audit,
    idempotency,
    logger
  );
  return { service, transactions, reconciliations, notifications, audit, idempotency };
}

describe("RecurringReconciliationService.reconcileIncoming", () => {
  it("does nothing when there are no candidates", async () => {
    const { service, reconciliations, transactions } = buildService({ candidates: [] });
    await service.reconcileIncoming("user-a", incomingTransaction);
    expect(reconciliations.create).not.toHaveBeenCalled();
    expect(transactions.reverseInTx).not.toHaveBeenCalled();
  });

  it("auto-reverses the recurring transaction on a clean unique match, without a notification", async () => {
    const { service, reconciliations, transactions, notifications } = buildService({
      candidates: [
        {
          transactionId: RECURRING_TXN_ID,
          ruleId: RULE_ID,
          accountId: ACCOUNT_ID,
          type: "expense",
          amountMinor: 200_000,
          occurredAt: new Date("2026-08-01T00:00:00.000Z")
        }
      ]
    });

    await service.reconcileIncoming("user-a", incomingTransaction);

    expect(transactions.reverseInTx).toHaveBeenCalledWith("user-a", RECURRING_TXN_ID, "tx1");
    expect(reconciliations.create).toHaveBeenCalledWith(
      "user-a",
      expect.objectContaining({ status: "auto_matched", recurringTransactionId: RECURRING_TXN_ID }),
      "tx1"
    );
    expect(notifications.enqueue).not.toHaveBeenCalled();
  });

  it("flags ambiguous candidates without reversing anything, and enqueues a notification", async () => {
    const { service, reconciliations, transactions, notifications } = buildService({
      candidates: [
        {
          transactionId: RECURRING_TXN_ID,
          ruleId: RULE_ID,
          accountId: ACCOUNT_ID,
          type: "expense",
          amountMinor: 200_000,
          occurredAt: new Date("2026-08-01T00:00:00.000Z")
        },
        {
          transactionId: OTHER_RECURRING_TXN_ID,
          ruleId: "55555555-5555-4555-8555-555555555555",
          accountId: ACCOUNT_ID,
          type: "expense",
          amountMinor: 200_000,
          occurredAt: new Date("2026-08-01T00:00:00.000Z")
        }
      ]
    });

    await service.reconcileIncoming("user-a", incomingTransaction);

    expect(transactions.reverseInTx).not.toHaveBeenCalled();
    expect(reconciliations.create).toHaveBeenCalledWith(
      "user-a",
      expect.objectContaining({ status: "ambiguous" }),
      "tx1"
    );
    expect(notifications.enqueue).toHaveBeenCalledWith(
      "user-a",
      "recurring_reconciliation_pending",
      expect.objectContaining({ status: "ambiguous" }),
      "tx1"
    );
  });

  it("flags an amount mismatch without reversing anything, and enqueues a notification", async () => {
    const { service, reconciliations, transactions, notifications } = buildService({
      candidates: [
        {
          transactionId: RECURRING_TXN_ID,
          ruleId: RULE_ID,
          accountId: ACCOUNT_ID,
          type: "expense",
          amountMinor: 250_000,
          occurredAt: new Date("2026-08-01T00:00:00.000Z")
        }
      ]
    });

    await service.reconcileIncoming("user-a", incomingTransaction);

    expect(transactions.reverseInTx).not.toHaveBeenCalled();
    expect(reconciliations.create).toHaveBeenCalledWith(
      "user-a",
      expect.objectContaining({ status: "amount_mismatch" }),
      "tx1"
    );
    expect(notifications.enqueue).toHaveBeenCalledWith(
      "user-a",
      "recurring_reconciliation_pending",
      expect.objectContaining({ status: "amount_mismatch" }),
      "tx1"
    );
  });
});

describe("RecurringReconciliationService.resolve", () => {
  const ambiguousRow = {
    id: "66666666-6666-4666-8666-666666666666",
    userId: "user-a",
    incomingTransactionId: INCOMING_TXN_ID,
    candidateRecurringTransactionIds: [RECURRING_TXN_ID, OTHER_RECURRING_TXN_ID],
    status: "ambiguous" as const,
    createdAt: new Date(),
    updatedAt: new Date()
  };

  const mismatchRow = {
    ...ambiguousRow,
    status: "amount_mismatch" as const,
    candidateRecurringTransactionIds: [RECURRING_TXN_ID]
  };

  it("throws if the reconciliation does not exist", async () => {
    const { service } = buildService({});
    await expect(
      service.resolve("user-a", ambiguousRow.id, { resolution: "confirmed_distinct" }, "key-1")
    ).rejects.toBeInstanceOf(EntityNotFoundError);
  });

  it("throws if the reconciliation is already resolved", async () => {
    const { service } = buildService({
      reconciliations: {
        findById: vi.fn(async () => ({
          ...ambiguousRow,
          resolution: "confirmed_distinct",
          resolvedAt: new Date()
        }))
      }
    });
    await expect(
      service.resolve("user-a", ambiguousRow.id, { resolution: "confirmed_distinct" }, "key-1")
    ).rejects.toBeInstanceOf(ReconciliationAlreadyResolvedError);
  });

  it("rejects confirming a duplicate on an ambiguous row without a chosen candidate", async () => {
    const { service } = buildService({
      reconciliations: { findById: vi.fn(async () => ambiguousRow) }
    });
    await expect(
      service.resolve("user-a", ambiguousRow.id, { resolution: "confirmed_duplicate" }, "key-1")
    ).rejects.toBeInstanceOf(InvalidReconciliationResolutionError);
  });

  it("reverses the chosen candidate when confirming a duplicate on an ambiguous row", async () => {
    const { service, transactions, reconciliations } = buildService({
      reconciliations: { findById: vi.fn(async () => ambiguousRow) }
    });
    await service.resolve(
      "user-a",
      ambiguousRow.id,
      {
        resolution: "confirmed_duplicate",
        chosenRecurringTransactionId: OTHER_RECURRING_TXN_ID
      },
      "key-1"
    );
    expect(transactions.reverseInTx).toHaveBeenCalledWith("user-a", OTHER_RECURRING_TXN_ID, "tx1");
    expect(reconciliations.resolve).toHaveBeenCalledWith(
      "user-a",
      ambiguousRow.id,
      "confirmed_duplicate",
      "tx1"
    );
  });

  it("defaults to the sole candidate when confirming a duplicate on an amount_mismatch row", async () => {
    const { service, transactions } = buildService({
      reconciliations: { findById: vi.fn(async () => mismatchRow) }
    });
    await service.resolve("user-a", mismatchRow.id, { resolution: "confirmed_duplicate" }, "key-1");
    expect(transactions.reverseInTx).toHaveBeenCalledWith("user-a", RECURRING_TXN_ID, "tx1");
  });

  it("does not reverse anything when confirming the transactions are distinct", async () => {
    const { service, transactions, reconciliations } = buildService({
      reconciliations: { findById: vi.fn(async () => ambiguousRow) }
    });
    await service.resolve("user-a", ambiguousRow.id, { resolution: "confirmed_distinct" }, "key-1");
    expect(transactions.reverseInTx).not.toHaveBeenCalled();
    expect(reconciliations.resolve).toHaveBeenCalledWith(
      "user-a",
      ambiguousRow.id,
      "confirmed_distinct",
      "tx1"
    );
  });

  it("rejects resolving an already auto-matched row", async () => {
    const { service } = buildService({
      reconciliations: {
        findById: vi.fn(async () => ({ ...ambiguousRow, status: "auto_matched" as const }))
      }
    });
    await expect(
      service.resolve("user-a", ambiguousRow.id, { resolution: "confirmed_distinct" }, "key-1")
    ).rejects.toBeInstanceOf(InvalidReconciliationResolutionError);
  });
});
