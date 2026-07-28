import type { CreateTransfer, Transaction } from "@treasury-ops/shared";
import { describe, expect, it, vi } from "vitest";

import { EntityNotFoundError } from "../../common/errors/entity-not-found.error.js";
import { TransactionNotReversibleError } from "../../common/errors/transaction-not-reversible.error.js";
import { focusedTestDouble } from "../../test/mock-drizzle.js";
import { TransferService } from "../transfer.service.js";

const GROUP_ID = "123e4567-e89b-42d3-a456-426614174000";
const REVERSE_GROUP_ID = "223e4567-e89b-42d3-a456-426614174000";
const FROM_ACCOUNT_ID = "323e4567-e89b-42d3-a456-426614174000";
const TO_ACCOUNT_ID = "423e4567-e89b-42d3-a456-426614174000";
const NOW = new Date("2026-07-01T00:00:00.000Z");
const FROM_LEG: Transaction = {
  id: "523e4567-e89b-42d3-a456-426614174000",
  userId: "u1",
  accountId: FROM_ACCOUNT_ID,
  type: "expense",
  status: "posted",
  amountMinor: 10_000,
  currency: "INR",
  source: "manual",
  occurredAt: NOW,
  description: "Transfer",
  tags: [],
  transferGroupId: GROUP_ID,
  createdAt: NOW,
  updatedAt: NOW
};
const TO_LEG: Transaction = {
  ...FROM_LEG,
  id: "623e4567-e89b-42d3-a456-426614174000",
  accountId: TO_ACCOUNT_ID,
  type: "income"
};
const FROM_REVERSAL: Transaction = {
  ...FROM_LEG,
  id: "723e4567-e89b-42d3-a456-426614174000",
  type: "income",
  status: "reversal",
  reversalOf: FROM_LEG.id,
  transferGroupId: REVERSE_GROUP_ID
};
const TO_REVERSAL: Transaction = {
  ...TO_LEG,
  id: "823e4567-e89b-42d3-a456-426614174000",
  type: "expense",
  status: "reversal",
  reversalOf: TO_LEG.id,
  transferGroupId: REVERSE_GROUP_ID
};
const INPUT: CreateTransfer = {
  fromAccountId: FROM_ACCOUNT_ID,
  toAccountId: TO_ACCOUNT_ID,
  amountMinor: 10_000,
  occurredAt: NOW,
  description: "Transfer",
  tags: []
};

type Double = Readonly<Record<string, ReturnType<typeof vi.fn>>>;
type Overrides = Readonly<{
  db?: Double;
  accounts?: Double;
  transactions?: Double;
  audit?: Double;
  logger?: Double;
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
    transactions: overrides.transactions ?? {},
    audit: overrides.audit ?? { record: vi.fn().mockResolvedValue(undefined) },
    logger: overrides.logger ?? { log: vi.fn(), warn: vi.fn() }
  };
  const service = new TransferService(
    focusedTestDouble(collaborators.db),
    focusedTestDouble(collaborators.accounts),
    focusedTestDouble(collaborators.transactions),
    focusedTestDouble(collaborators.audit),
    focusedTestDouble(collaborators.logger)
  );
  return { service, tx, ...collaborators };
}

describe("TransferService create", () => {
  it("rejects a missing destination account after debiting the source", async () => {
    const accounts = {
      applyBalanceDelta: vi
        .fn()
        .mockResolvedValueOnce("applied")
        .mockResolvedValueOnce("account_not_found")
    };
    const context = createService({ accounts });

    await expect(context.service.create("u1", INPUT, undefined)).rejects.toBeInstanceOf(
      EntityNotFoundError
    );
    expect(accounts.applyBalanceDelta).toHaveBeenNthCalledWith(
      2,
      "u1",
      TO_ACCOUNT_ID,
      10_000,
      context.tx
    );
  });

  it("serves a complete transfer after an idempotency unique violation", async () => {
    const transactions = {
      findByIdempotencyKey: vi.fn().mockResolvedValue(FROM_LEG),
      findLegsByTransferGroupId: vi.fn().mockResolvedValue([FROM_LEG, TO_LEG])
    };
    const context = createService({
      db: { transaction: vi.fn().mockRejectedValue({ code: "23505" }) },
      transactions
    });

    await expect(context.service.create("u1", INPUT, "key")).resolves.toEqual({
      transferGroupId: GROUP_ID,
      fromTransaction: FROM_LEG,
      toTransaction: TO_LEG,
      replayed: true
    });
    expect(context.logger.warn).toHaveBeenCalled();
  });

  it("rethrows invalid replay failures at each lookup guard", async () => {
    const unique = { code: "23505" };
    const ordinary = new Error("failed");
    const scenarios = [
      { error: unique, key: undefined, transactions: {} },
      { error: ordinary, key: "key", transactions: {} },
      {
        error: unique,
        key: "key",
        transactions: { findByIdempotencyKey: vi.fn().mockResolvedValue(null) }
      },
      {
        error: unique,
        key: "key",
        transactions: {
          findByIdempotencyKey: vi
            .fn()
            .mockResolvedValue({ ...FROM_LEG, transferGroupId: undefined })
        }
      },
      {
        error: unique,
        key: "key",
        transactions: {
          findByIdempotencyKey: vi.fn().mockResolvedValue(FROM_LEG),
          findLegsByTransferGroupId: vi.fn().mockResolvedValue([FROM_LEG])
        }
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
});

describe("TransferService reverse", () => {
  it("reverses both legs with opposite account deltas", async () => {
    const transactions = {
      findPostedLegsByTransferGroupId: vi.fn().mockResolvedValue([FROM_LEG, TO_LEG]),
      createReversal: vi
        .fn()
        .mockResolvedValueOnce(FROM_REVERSAL)
        .mockResolvedValueOnce(TO_REVERSAL),
      markReversed: vi.fn().mockResolvedValue(true)
    };
    const accounts = { applyReversalBalanceDelta: vi.fn().mockResolvedValue("applied") };
    const context = createService({ transactions, accounts });

    const result = await context.service.reverse("u1", GROUP_ID);

    expect(result).toMatchObject({ replayed: false });
    expect(result.legs).toEqual([FROM_REVERSAL, TO_REVERSAL]);
    expect(accounts.applyReversalBalanceDelta).toHaveBeenNthCalledWith(
      1,
      "u1",
      FROM_ACCOUNT_ID,
      10_000,
      context.tx
    );
    expect(accounts.applyReversalBalanceDelta).toHaveBeenNthCalledWith(
      2,
      "u1",
      TO_ACCOUNT_ID,
      -10_000,
      context.tx
    );
  });

  it("distinguishes an unknown transfer from a non-reversible transfer", async () => {
    const missing = createService({
      transactions: {
        findPostedLegsByTransferGroupId: vi.fn().mockResolvedValue([]),
        findLegsByTransferGroupId: vi.fn().mockResolvedValue([])
      }
    });
    await expect(missing.service.reverse("u1", GROUP_ID)).rejects.toBeInstanceOf(
      EntityNotFoundError
    );

    const reversed = createService({
      transactions: {
        findPostedLegsByTransferGroupId: vi.fn().mockResolvedValue([]),
        findLegsByTransferGroupId: vi.fn().mockResolvedValue([FROM_LEG])
      }
    });
    await expect(reversed.service.reverse("u1", GROUP_ID)).rejects.toBeInstanceOf(
      TransactionNotReversibleError
    );
  });

  it("rejects a leg race and a missing account", async () => {
    const scenarios = [
      {
        transactions: {
          findPostedLegsByTransferGroupId: vi.fn().mockResolvedValue([FROM_LEG, TO_LEG]),
          createReversal: vi.fn().mockResolvedValue(FROM_REVERSAL),
          markReversed: vi.fn().mockResolvedValue(false),
          findLegsByTransferGroupId: vi.fn().mockResolvedValue([])
        },
        accounts: {},
        expected: TransactionNotReversibleError
      },
      {
        transactions: {
          findPostedLegsByTransferGroupId: vi.fn().mockResolvedValue([FROM_LEG, TO_LEG]),
          createReversal: vi.fn().mockResolvedValue(FROM_REVERSAL),
          markReversed: vi.fn().mockResolvedValue(true),
          findLegsByTransferGroupId: vi.fn().mockResolvedValue([])
        },
        accounts: { applyReversalBalanceDelta: vi.fn().mockResolvedValue("account_not_found") },
        expected: EntityNotFoundError
      }
    ];

    for (const scenario of scenarios) {
      const context = createService({
        transactions: scenario.transactions,
        accounts: scenario.accounts
      });
      await expect(context.service.reverse("u1", GROUP_ID)).rejects.toBeInstanceOf(
        scenario.expected
      );
    }
  });

  it("serves a previously-created reversal pair after a concurrent failure", async () => {
    const transactions = {
      findLegsByTransferGroupId: vi.fn().mockResolvedValue([FROM_LEG, TO_LEG]),
      findByReversalOf: vi
        .fn()
        .mockResolvedValueOnce(FROM_REVERSAL)
        .mockResolvedValueOnce(TO_REVERSAL)
    };
    const context = createService({
      db: { transaction: vi.fn().mockRejectedValue(new Error("raced")) },
      transactions
    });

    await expect(context.service.reverse("u1", GROUP_ID)).resolves.toEqual({
      transferGroupId: REVERSE_GROUP_ID,
      legs: [FROM_REVERSAL, TO_REVERSAL],
      replayed: true
    });
    expect(context.logger.warn).toHaveBeenCalled();
  });

  it("rethrows replay failures for wrong leg counts, absent reversals, and missing group metadata", async () => {
    const failure = new Error("raced");
    const scenarios = [
      { findLegs: [], reversals: [] },
      { findLegs: [FROM_LEG], reversals: [] },
      { findLegs: [FROM_LEG, TO_LEG], reversals: [null, TO_REVERSAL] },
      { findLegs: [FROM_LEG, TO_LEG], reversals: [FROM_REVERSAL, undefined] },
      {
        findLegs: [FROM_LEG, TO_LEG],
        reversals: [{ ...FROM_REVERSAL, transferGroupId: undefined }, TO_REVERSAL]
      }
    ];

    for (const scenario of scenarios) {
      const transactions = {
        findLegsByTransferGroupId: vi.fn().mockResolvedValue(scenario.findLegs),
        findByReversalOf: vi.fn()
      };
      for (const reversal of scenario.reversals) {
        transactions.findByReversalOf.mockResolvedValueOnce(reversal);
      }
      const context = createService({
        db: { transaction: vi.fn().mockRejectedValue(failure) },
        transactions
      });
      await expect(context.service.reverse("u1", GROUP_ID)).rejects.toBe(failure);
    }
  });
});
