import { describe, expect, it, vi } from "vitest";

import { InvalidReconciliationResolutionError } from "../../common/errors/invalid-reconciliation-resolution.error.js";
import { ReconciliationAlreadyResolvedError } from "../../common/errors/reconciliation-already-resolved.error.js";
import { EntityNotFoundError } from "../../common/errors/entity-not-found.error.js";

const reverseTransactionInTx = vi.fn(async (...args: unknown[]) => {
  void args;
  return undefined;
});
vi.mock("../../transactions/reverse-transaction-in-tx.js", () => ({
  reverseTransactionInTx: (...args: unknown[]) => reverseTransactionInTx(...args)
}));

const { RecurringReconciliationService } = await import("../recurring-reconciliation.service.js");

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
  paymentRail: "unknown" as const,
  counterpartyHandle: null,
  createdAt: new Date(),
  updatedAt: new Date()
};

function buildService(overrides: {
  candidates?: unknown[];
  occurrenceCandidates?: unknown[];
  reconciliations?: Record<string, unknown>;
  occurrences?: Record<string, unknown>;
  notifications?: Record<string, unknown>;
  transactions?: Record<string, unknown>;
}) {
  reverseTransactionInTx.mockClear();
  const db = {
    transaction: vi.fn((operation: (tx: string) => Promise<unknown>) => operation("tx1"))
  };
  const transactions = {
    findById: vi.fn(async () => null),
    attachToRecurringRule: vi.fn(async (_userId: string, transactionId: string) => ({
      id: transactionId
    })),
    ...overrides.transactions
  };
  const accounts = {};
  const reconciliations = {
    findUnreconciledRecurringCandidates: vi.fn(async () => overrides.candidates ?? []),
    findByIncomingTransactionId: vi.fn(async () => null),
    create: vi.fn(async () => undefined),
    findById: vi.fn(async () => null),
    resolve: vi.fn(async (userId: string, id: string, resolution: string) => ({
      id,
      userId,
      resolution
    })),
    ...overrides.reconciliations
  };
  const occurrences = {
    findPendingCandidatesForMatching: vi.fn(async () => overrides.occurrenceCandidates ?? []),
    confirm: vi.fn(
      async (_userId: string, occurrenceId: string, confirmedTransactionId: string) => ({
        id: occurrenceId,
        status: "confirmed",
        confirmedTransactionId
      })
    ),
    ...overrides.occurrences
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
  const moduleRef = {
    get: vi.fn(() => ({ onTransactionReversedInTx: vi.fn(async () => undefined) }))
  };

  const service = new RecurringReconciliationService(
    // @ts-expect-error mock db for unit testing
    db,
    transactions,
    accounts,
    reconciliations,
    occurrences,
    notifications,
    audit,
    idempotency,
    logger,
    undefined,
    moduleRef
  );
  return { service, reconciliations, occurrences, notifications, audit, idempotency, transactions };
}

describe("RecurringReconciliationService.reconcileIncoming", () => {
  it("does nothing when there are no candidates", async () => {
    const { service, reconciliations } = buildService({ candidates: [] });
    await service.reconcileIncoming("user-a", incomingTransaction);
    expect(reconciliations.create).not.toHaveBeenCalled();
    expect(reverseTransactionInTx).not.toHaveBeenCalled();
  });

  it("auto-reverses the recurring transaction on a clean unique match, without a notification", async () => {
    const { service, reconciliations, notifications } = buildService({
      candidates: [
        {
          transactionId: RECURRING_TXN_ID,
          ruleId: RULE_ID,
          accountId: ACCOUNT_ID,
          type: "expense",
          amountMinor: 200_000,
          occurredAt: new Date("2026-08-01T00:00:00.000Z"),
          templateDescription: "Claude subscription"
        }
      ]
    });

    await service.reconcileIncoming("user-a", incomingTransaction);

    expect(reverseTransactionInTx).toHaveBeenCalledWith(
      expect.anything(),
      "user-a",
      RECURRING_TXN_ID,
      "tx1"
    );
    expect(reconciliations.create).toHaveBeenCalledWith(
      "user-a",
      expect.objectContaining({ status: "auto_matched", recurringTransactionId: RECURRING_TXN_ID }),
      "tx1"
    );
    expect(notifications.enqueue).not.toHaveBeenCalled();
  });

  it("flags ambiguous candidates without reversing anything, and enqueues a notification", async () => {
    const { service, reconciliations, notifications } = buildService({
      candidates: [
        {
          transactionId: RECURRING_TXN_ID,
          ruleId: RULE_ID,
          accountId: ACCOUNT_ID,
          type: "expense",
          amountMinor: 200_000,
          occurredAt: new Date("2026-08-01T00:00:00.000Z"),
          templateDescription: "Claude subscription"
        },
        {
          transactionId: OTHER_RECURRING_TXN_ID,
          ruleId: "55555555-5555-4555-8555-555555555555",
          accountId: ACCOUNT_ID,
          type: "expense",
          amountMinor: 200_000,
          occurredAt: new Date("2026-08-01T00:00:00.000Z"),
          templateDescription: "Claude subscription"
        }
      ]
    });

    await service.reconcileIncoming("user-a", incomingTransaction);

    expect(reverseTransactionInTx).not.toHaveBeenCalled();
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
    const { service, reconciliations, notifications } = buildService({
      candidates: [
        {
          transactionId: RECURRING_TXN_ID,
          ruleId: RULE_ID,
          accountId: ACCOUNT_ID,
          type: "expense",
          amountMinor: 250_000,
          occurredAt: new Date("2026-08-01T00:00:00.000Z"),
          templateDescription: "Claude subscription"
        }
      ]
    });

    await service.reconcileIncoming("user-a", incomingTransaction);

    expect(reverseTransactionInTx).not.toHaveBeenCalled();
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

describe("RecurringReconciliationService.reconcileIncoming — manual-post occurrence matching", () => {
  const OCCURRENCE_ID = "88888888-8888-4888-8888-888888888888";

  it("auto-confirms a clean occurrence match by attaching the rule and confirming the occurrence", async () => {
    const { service, occurrences, transactions } = buildService({
      candidates: [],
      occurrenceCandidates: [
        {
          transactionId: OCCURRENCE_ID,
          ruleId: RULE_ID,
          accountId: ACCOUNT_ID,
          type: "expense",
          amountMinor: 200_000,
          occurredAt: new Date("2026-08-01T00:00:00.000Z"),
          templateDescription: "Claude subscription"
        }
      ]
    });

    await service.reconcileIncoming("user-a", incomingTransaction);

    expect(transactions.attachToRecurringRule).toHaveBeenCalledWith(
      "user-a",
      INCOMING_TXN_ID,
      RULE_ID,
      "tx1"
    );
    expect(occurrences.confirm).toHaveBeenCalledWith(
      "user-a",
      OCCURRENCE_ID,
      INCOMING_TXN_ID,
      "tx1"
    );
  });

  it("does not confirm an ambiguous occurrence match, leaving it expected for manual linking", async () => {
    const { service, occurrences } = buildService({
      candidates: [],
      occurrenceCandidates: [
        {
          transactionId: OCCURRENCE_ID,
          ruleId: RULE_ID,
          accountId: ACCOUNT_ID,
          type: "expense",
          amountMinor: 200_000,
          occurredAt: new Date("2026-08-01T00:00:00.000Z"),
          templateDescription: "Claude subscription"
        },
        {
          transactionId: "99999999-9999-4999-8999-999999999999",
          ruleId: "55555555-5555-4555-8555-555555555555",
          accountId: ACCOUNT_ID,
          type: "expense",
          amountMinor: 200_000,
          occurredAt: new Date("2026-08-01T00:00:00.000Z"),
          templateDescription: "Claude subscription"
        }
      ]
    });

    await service.reconcileIncoming("user-a", incomingTransaction);

    expect(occurrences.confirm).not.toHaveBeenCalled();
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
    const { service, reconciliations } = buildService({
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
    expect(reverseTransactionInTx).toHaveBeenCalledWith(
      expect.anything(),
      "user-a",
      OTHER_RECURRING_TXN_ID,
      "tx1"
    );
    expect(reconciliations.resolve).toHaveBeenCalledWith(
      "user-a",
      ambiguousRow.id,
      "confirmed_duplicate",
      "tx1"
    );
  });

  it("defaults to the sole candidate when confirming a duplicate on an amount_mismatch row", async () => {
    const { service } = buildService({
      reconciliations: { findById: vi.fn(async () => mismatchRow) }
    });
    await service.resolve("user-a", mismatchRow.id, { resolution: "confirmed_duplicate" }, "key-1");
    expect(reverseTransactionInTx).toHaveBeenCalledWith(
      expect.anything(),
      "user-a",
      RECURRING_TXN_ID,
      "tx1"
    );
  });

  it("does not reverse anything when confirming the transactions are distinct", async () => {
    const { service, reconciliations } = buildService({
      reconciliations: { findById: vi.fn(async () => ambiguousRow) }
    });
    await service.resolve("user-a", ambiguousRow.id, { resolution: "confirmed_distinct" }, "key-1");
    expect(reverseTransactionInTx).not.toHaveBeenCalled();
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

describe("RecurringReconciliationService.listPending", () => {
  const pendingRow = {
    id: "77777777-7777-4777-8777-777777777777",
    userId: "user-a",
    incomingTransactionId: INCOMING_TXN_ID,
    candidateRecurringTransactionIds: [RECURRING_TXN_ID, OTHER_RECURRING_TXN_ID],
    status: "ambiguous" as const,
    createdAt: new Date(),
    updatedAt: new Date()
  };

  function transactionWithId(id: string) {
    return { ...incomingTransaction, id };
  }

  it("populates the incoming and candidate transactions for each pending row", async () => {
    const { service } = buildService({
      reconciliations: { findPending: vi.fn(async () => [pendingRow]) },
      transactions: {
        findById: vi.fn(async (_userId: string, id: string) => transactionWithId(id))
      }
    });

    const items = await service.listPending("user-a");

    expect(items).toEqual([
      {
        ...pendingRow,
        incomingTransaction: transactionWithId(INCOMING_TXN_ID),
        candidateTransactions: [
          transactionWithId(RECURRING_TXN_ID),
          transactionWithId(OTHER_RECURRING_TXN_ID)
        ]
      }
    ]);
  });

  it("skips a row whose incoming transaction can no longer be found", async () => {
    const { service } = buildService({
      reconciliations: { findPending: vi.fn(async () => [pendingRow]) },
      transactions: { findById: vi.fn(async () => null) }
    });

    expect(await service.listPending("user-a")).toEqual([]);
  });

  it("omits a candidate transaction that can no longer be found, without failing the row", async () => {
    const { service } = buildService({
      reconciliations: { findPending: vi.fn(async () => [pendingRow]) },
      transactions: {
        findById: vi.fn(async (_userId: string, id: string) =>
          id === RECURRING_TXN_ID ? null : transactionWithId(id)
        )
      }
    });

    const [item] = await service.listPending("user-a");
    expect(item?.candidateTransactions.map((txn) => txn.id)).toEqual([OTHER_RECURRING_TXN_ID]);
  });
});
