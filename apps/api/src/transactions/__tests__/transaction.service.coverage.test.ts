import type { Transaction } from "@treasury-ops/shared";
import { describe, expect, it, vi } from "vitest";

import { CategoryKindMismatchError } from "../../common/errors/category-kind-mismatch.error.js";
import { EntityNotFoundError } from "../../common/errors/entity-not-found.error.js";
import { TransactionNotReversibleError } from "../../common/errors/transaction-not-reversible.error.js";
import { TransferMetadataRequiresGroupError } from "../../common/errors/transfer-metadata-requires-group.error.js";
import { focusedTestDouble } from "../../test/mock-drizzle.js";
import { TransactionMutationService } from "../transaction-mutation.service.js";
import { TransactionService } from "../transaction.service.js";

const TRANSACTION_ID = "123e4567-e89b-42d3-a456-426614174000";
const ACCOUNT_ID = "223e4567-e89b-42d3-a456-426614174000";
const CATEGORY_ID = "323e4567-e89b-42d3-a456-426614174000";
const NOW = new Date("2026-07-01T00:00:00.000Z");
const TRANSACTION: Transaction = {
  id: TRANSACTION_ID,
  userId: "u1",
  accountId: ACCOUNT_ID,
  categoryId: CATEGORY_ID,
  type: "expense",
  status: "posted",
  amountMinor: 5_000,
  currency: "INR",
  source: "manual",
  paymentRail: "unknown",
  counterpartyHandle: null,
  occurredAt: NOW,
  description: "Coffee",
  tags: ["food"],
  createdAt: NOW,
  updatedAt: NOW
};
const REVERSAL: Transaction = {
  ...TRANSACTION,
  id: "423e4567-e89b-42d3-a456-426614174000",
  categoryId: undefined,
  type: "income",
  status: "reversal",
  reversalOf: TRANSACTION_ID
};
const INPUT = {
  accountId: ACCOUNT_ID,
  type: "expense" as const,
  amountMinor: 5_000,
  occurredAt: NOW,
  description: "Coffee",
  tags: ["food"]
};

type Double = Readonly<Record<string, ReturnType<typeof vi.fn>>>;
type Overrides = Readonly<{
  db?: Double;
  accounts?: Double;
  categories?: Double;
  transactions?: Double;
  audit?: Double;
  logger?: Double;
  assetFundings?: Double;
}>;

function createService(overrides: Overrides = {}) {
  const tx = {};
  const collaborators = {
    db:
      overrides.db ??
      ({
        transaction: vi.fn(async (work: (value: object) => Promise<unknown>) => work(tx))
      } satisfies Record<string, unknown>),
    accounts: overrides.accounts ?? {},
    categories: overrides.categories ?? {},
    transactions: overrides.transactions ?? {},
    audit: overrides.audit ?? { record: vi.fn().mockResolvedValue(undefined) },
    logger: overrides.logger ?? { log: vi.fn(), warn: vi.fn() },
    assetFundings: overrides.assetFundings
  };
  const service = new TransactionService(
    focusedTestDouble(collaborators.db),
    focusedTestDouble(collaborators.accounts),
    focusedTestDouble(collaborators.categories),
    focusedTestDouble(collaborators.transactions),
    focusedTestDouble(collaborators.audit),
    focusedTestDouble(collaborators.logger),
    undefined,
    undefined,
    collaborators.assetFundings === undefined
      ? undefined
      : focusedTestDouble(collaborators.assetFundings),
    undefined
  );
  return { service, tx, ...collaborators };
}

describe("TransactionService create and reads", () => {
  it("creates an income transaction without a category and logs it", async () => {
    const income = { ...TRANSACTION, type: "income" as const };
    const accounts = { applyBalanceDelta: vi.fn().mockResolvedValue("applied") };
    const transactions = { create: vi.fn().mockResolvedValue(income) };
    const context = createService({ accounts, transactions });

    await expect(
      context.service.create("u1", { ...INPUT, type: "income" }, undefined)
    ).resolves.toEqual({ transaction: income, replayed: false });
    expect(accounts.applyBalanceDelta).toHaveBeenCalledWith("u1", ACCOUNT_ID, 5_000, context.tx);
    expect(context.logger.log).toHaveBeenCalled();
  });

  it("validates category existence and kind before creating", async () => {
    const missing = createService({
      categories: { findActiveById: vi.fn().mockResolvedValue(null) }
    });
    await expect(
      missing.service.create("u1", { ...INPUT, categoryId: CATEGORY_ID }, undefined)
    ).rejects.toBeInstanceOf(EntityNotFoundError);

    const mismatch = createService({
      categories: { findActiveById: vi.fn().mockResolvedValue({ kind: "income" }) }
    });
    await expect(
      mismatch.service.create("u1", { ...INPUT, categoryId: CATEGORY_ID }, undefined)
    ).rejects.toBeInstanceOf(CategoryKindMismatchError);
  });

  it("serves a replay after an idempotency-key unique violation", async () => {
    const replayed = { ...TRANSACTION, idempotencyKey: "key-1" };
    const failure = { code: "23505" };
    const transactions = {
      findByIdempotencyKey: vi.fn().mockResolvedValue(replayed)
    };
    const context = createService({
      db: { transaction: vi.fn().mockRejectedValue(failure) },
      transactions
    });

    await expect(context.service.create("u1", INPUT, "key-1")).resolves.toEqual({
      transaction: replayed,
      replayed: true
    });
    expect(context.logger.warn).toHaveBeenCalled();
  });

  it("rethrows non-idempotent, non-unique, and unresolved duplicate failures", async () => {
    const unique = { code: "23505" };
    const ordinary = new Error("failed");
    const scenarios = [
      { error: unique, key: undefined, transactions: {} },
      { error: ordinary, key: "key-1", transactions: {} },
      {
        error: unique,
        key: "key-1",
        transactions: { findByIdempotencyKey: vi.fn().mockResolvedValue(null) }
      }
    ];

    for (const scenario of scenarios) {
      const context = createService({
        db: { transaction: vi.fn().mockRejectedValue(scenario.error) },
        transactions: scenario.transactions
      });
      await expect(context.service.create("u1", INPUT, scenario.key)).rejects.toBe(scenario.error);
    }
  });

  it("lists transactions and gets an existing transaction", async () => {
    const page = {
      items: [TRANSACTION],
      pageInfo: { nextCursor: null, hasMore: false, limit: 50 }
    };
    const transactions = {
      findMany: vi.fn().mockResolvedValue(page),
      findById: vi.fn().mockResolvedValue(TRANSACTION)
    };
    const context = createService({ transactions });

    await expect(context.service.list("u1", { limit: 50 })).resolves.toEqual(page);
    await expect(context.service.get("u1", TRANSACTION_ID)).resolves.toBe(TRANSACTION);
  });

  it("hydrates active funding summaries in one batched lookup", async () => {
    const secondTransaction = { ...TRANSACTION, id: "523e4567-e89b-42d3-a456-426614174000" };
    const page = {
      items: [TRANSACTION, secondTransaction],
      pageInfo: { nextCursor: null, hasMore: false, limit: 50 }
    };
    const funding = {
      fundingId: "623e4567-e89b-42d3-a456-426614174000",
      assetId: "723e4567-e89b-42d3-a456-426614174000",
      assetName: "Index fund",
      assetKind: "investment" as const,
      amountMinor: 5_000
    };
    const transactions = { findMany: vi.fn().mockResolvedValue(page) };
    const assetFundings = {
      findActiveSummariesByTransactionIds: vi
        .fn()
        .mockResolvedValue(new Map([[TRANSACTION_ID, funding]]))
    };
    const context = createService({ transactions, assetFundings });

    await expect(context.service.list("u1", { limit: 50 })).resolves.toEqual({
      ...page,
      items: [{ ...TRANSACTION, assetFunding: funding }, secondTransaction]
    });
    expect(assetFundings.findActiveSummariesByTransactionIds).toHaveBeenCalledTimes(1);
    expect(assetFundings.findActiveSummariesByTransactionIds).toHaveBeenCalledWith("u1", [
      TRANSACTION_ID,
      secondTransaction.id
    ]);
  });

  it("hydrates the funding summary for a transaction detail", async () => {
    const funding = {
      fundingId: "623e4567-e89b-42d3-a456-426614174000",
      assetId: "723e4567-e89b-42d3-a456-426614174000",
      assetName: "Fixed deposit",
      assetKind: "fixed_deposit" as const,
      amountMinor: 5_000
    };
    const transactions = { findById: vi.fn().mockResolvedValue(TRANSACTION) };
    const assetFundings = {
      findActiveSummariesByTransactionIds: vi
        .fn()
        .mockResolvedValue(new Map([[TRANSACTION_ID, funding]]))
    };
    const context = createService({ transactions, assetFundings });

    await expect(context.service.get("u1", TRANSACTION_ID)).resolves.toEqual({
      ...TRANSACTION,
      assetFunding: funding
    });
    expect(assetFundings.findActiveSummariesByTransactionIds).toHaveBeenCalledWith("u1", [
      TRANSACTION_ID
    ]);
  });

  it("rejects a missing transaction from get", async () => {
    const context = createService({
      transactions: { findById: vi.fn().mockResolvedValue(null) }
    });
    await expect(context.service.get("u1", TRANSACTION_ID)).rejects.toBeInstanceOf(
      EntityNotFoundError
    );
  });
});

describe("TransactionService metadata updates", () => {
  it("updates through the public wrapper, clears a category, audits, and logs", async () => {
    const after = { ...TRANSACTION, categoryId: undefined, description: "Updated", tags: [] };
    const transactions = {
      findById: vi.fn().mockResolvedValue(TRANSACTION),
      updateNonMonetaryFields: vi.fn().mockResolvedValue(after)
    };
    const context = createService({ transactions });

    await expect(
      context.service.update("u1", TRANSACTION_ID, {
        description: "Updated",
        tags: [],
        categoryId: null
      })
    ).resolves.toBe(after);
    expect(context.audit.record).toHaveBeenCalledWith(
      "u1",
      "transaction.update",
      TRANSACTION_ID,
      context.tx,
      expect.objectContaining({
        before: expect.objectContaining({ description: "Coffee", categoryId: CATEGORY_ID }),
        after: expect.objectContaining({ description: "Updated", categoryId: undefined })
      })
    );
    expect(context.logger.log).toHaveBeenCalled();
  });

  it("validates an assigned category and permits an omitted category patch", async () => {
    const after = { ...TRANSACTION, description: "Updated" };
    const categories = { findActiveById: vi.fn().mockResolvedValue({ kind: "expense" }) };
    const transactions = {
      findById: vi.fn().mockResolvedValue(TRANSACTION),
      updateNonMonetaryFields: vi.fn().mockResolvedValue(after)
    };
    const context = createService({ transactions, categories });

    // @ts-expect-error - focused transaction double.
    await context.service.updateInTx("u1", TRANSACTION_ID, { categoryId: CATEGORY_ID }, context.tx);
    // @ts-expect-error - focused transaction double.
    await context.service.updateInTx("u1", TRANSACTION_ID, { description: "Updated" }, context.tx);
    expect(categories.findActiveById).toHaveBeenCalledOnce();
  });

  it("rejects missing transactions, transfer legs, missing categories, mismatches, and lost updates", async () => {
    const scenarios = [
      {
        expected: EntityNotFoundError,
        patch: { description: "Updated" },
        transactions: { findById: vi.fn().mockResolvedValue(null) },
        categories: {}
      },
      {
        expected: TransferMetadataRequiresGroupError,
        patch: { description: "Updated" },
        transactions: {
          findById: vi.fn().mockResolvedValue({
            ...TRANSACTION,
            transferGroupId: "523e4567-e89b-42d3-a456-426614174000"
          })
        },
        categories: {}
      },
      {
        expected: EntityNotFoundError,
        patch: { categoryId: CATEGORY_ID },
        transactions: { findById: vi.fn().mockResolvedValue(TRANSACTION) },
        categories: { findActiveById: vi.fn().mockResolvedValue(null) }
      },
      {
        expected: CategoryKindMismatchError,
        patch: { categoryId: CATEGORY_ID },
        transactions: { findById: vi.fn().mockResolvedValue(TRANSACTION) },
        categories: { findActiveById: vi.fn().mockResolvedValue({ kind: "income" }) }
      },
      {
        expected: EntityNotFoundError,
        patch: { description: "Updated" },
        transactions: {
          findById: vi.fn().mockResolvedValue(TRANSACTION),
          updateNonMonetaryFields: vi.fn().mockResolvedValue(null)
        },
        categories: {}
      }
    ];

    for (const scenario of scenarios) {
      const context = createService({
        transactions: scenario.transactions,
        categories: scenario.categories
      });
      await expect(
        context.service.updateInTx(
          "u1",
          TRANSACTION_ID,
          scenario.patch,
          // @ts-expect-error - focused transaction double.
          context.tx
        )
      ).rejects.toBeInstanceOf(scenario.expected);
    }
  });
});

describe("TransactionService reversals", () => {
  it("reverses an expense and updates an archived account balance", async () => {
    const transactions = {
      findPostedById: vi.fn().mockResolvedValue(TRANSACTION),
      createReversal: vi.fn().mockResolvedValue(REVERSAL),
      markReversed: vi.fn().mockResolvedValue(true)
    };
    const accounts = { applyReversalBalanceDelta: vi.fn().mockResolvedValue("applied") };
    const context = createService({ transactions, accounts });

    await expect(context.service.reverse("u1", TRANSACTION_ID)).resolves.toEqual({
      transaction: REVERSAL,
      replayed: false
    });
    expect(accounts.applyReversalBalanceDelta).toHaveBeenCalledWith(
      "u1",
      ACCOUNT_ID,
      5_000,
      context.tx
    );
  });

  it("uses a negative delta when reversing income", async () => {
    const income = { ...TRANSACTION, type: "income" as const };
    const transactions = {
      findPostedById: vi.fn().mockResolvedValue(income),
      createReversal: vi.fn().mockResolvedValue({ ...REVERSAL, type: "expense" }),
      markReversed: vi.fn().mockResolvedValue(true)
    };
    const accounts = { applyReversalBalanceDelta: vi.fn().mockResolvedValue("applied") };
    const context = createService({ transactions, accounts });

    await context.service.reverse("u1", TRANSACTION_ID);
    expect(accounts.applyReversalBalanceDelta).toHaveBeenCalledWith(
      "u1",
      ACCOUNT_ID,
      -5_000,
      context.tx
    );
  });

  it("distinguishes missing, already reversed, racing, and missing-account cases", async () => {
    const cases = [
      {
        expected: EntityNotFoundError,
        transactions: {
          findPostedById: vi.fn().mockResolvedValue(null),
          findById: vi.fn().mockResolvedValue(null),
          findByReversalOf: vi.fn().mockResolvedValue(null)
        },
        accounts: {}
      },
      {
        expected: TransactionNotReversibleError,
        transactions: {
          findPostedById: vi.fn().mockResolvedValue(null),
          findById: vi.fn().mockResolvedValue(TRANSACTION),
          findByReversalOf: vi.fn().mockResolvedValue(null)
        },
        accounts: {}
      },
      {
        expected: TransactionNotReversibleError,
        transactions: {
          findPostedById: vi.fn().mockResolvedValue(TRANSACTION),
          createReversal: vi.fn().mockResolvedValue(REVERSAL),
          markReversed: vi.fn().mockResolvedValue(false),
          findByReversalOf: vi.fn().mockResolvedValue(null)
        },
        accounts: {}
      },
      {
        expected: EntityNotFoundError,
        transactions: {
          findPostedById: vi.fn().mockResolvedValue(TRANSACTION),
          createReversal: vi.fn().mockResolvedValue(REVERSAL),
          markReversed: vi.fn().mockResolvedValue(true),
          findByReversalOf: vi.fn().mockResolvedValue(null)
        },
        accounts: { applyReversalBalanceDelta: vi.fn().mockResolvedValue("account_not_found") }
      }
    ];

    for (const testCase of cases) {
      const context = createService({
        transactions: testCase.transactions,
        accounts: testCase.accounts
      });
      await expect(context.service.reverse("u1", TRANSACTION_ID)).rejects.toBeInstanceOf(
        testCase.expected
      );
    }
  });

  it("serves an existing reversal after a concurrent failure", async () => {
    const failure = new Error("raced");
    const transactions = {
      findByReversalOf: vi.fn().mockResolvedValue(REVERSAL)
    };
    const context = createService({
      db: { transaction: vi.fn().mockRejectedValue(failure) },
      transactions
    });

    await expect(context.service.reverse("u1", TRANSACTION_ID)).resolves.toEqual({
      transaction: REVERSAL,
      replayed: true
    });
    expect(context.logger.warn).toHaveBeenCalled();
  });
});

describe("TransactionMutationService", () => {
  it("executes the update callback through idempotency", async () => {
    const transactions = { updateInTx: vi.fn().mockResolvedValue(TRANSACTION) };
    const tx = {};
    const idempotency = {
      execute: vi.fn(
        async (
          _userId: string,
          _operation: string,
          _key: string,
          _intent: unknown,
          _schema: unknown,
          work: (value: object) => Promise<Transaction>
        ) => ({ result: await work(tx), replayed: false })
      )
    };
    // @ts-expect-error - focused collaborators implement the exercised methods.
    const service = new TransactionMutationService(transactions, idempotency);

    await expect(
      service.update("u1", TRANSACTION_ID, { description: "Updated" }, "key")
    ).resolves.toEqual({ result: TRANSACTION, replayed: false });
    expect(transactions.updateInTx).toHaveBeenCalledWith(
      "u1",
      TRANSACTION_ID,
      { description: "Updated" },
      tx
    );
  });
});
