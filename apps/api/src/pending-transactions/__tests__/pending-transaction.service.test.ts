import type { PendingTransaction, Transaction } from "@treasury-ops/shared";
import { describe, expect, it, vi } from "vitest";

import { EntityNotFoundError } from "../../common/errors/entity-not-found.error.js";
import { PendingTransactionAlreadyResolvedError } from "../../common/errors/pending-transaction-already-resolved.error.js";
import { focusedTestDouble } from "../../test/mock-drizzle.js";
import { PendingTransactionService } from "../pending-transaction.service.js";

const USER_ID = "u1";
const PENDING_ID = "123e4567-e89b-42d3-a456-426614174000";
const ACCOUNT_ID = "223e4567-e89b-42d3-a456-426614174000";
const RESULTING_TXN_ID = "323e4567-e89b-42d3-a456-426614174000";
const NOW = new Date("2026-07-18T00:00:00.000Z");

const PENDING: PendingTransaction = {
  id: PENDING_ID,
  userId: USER_ID,
  accountId: ACCOUNT_ID,
  type: "expense",
  occurredAt: NOW,
  description: "Anthropic — USD 23.60, INR amount pending",
  status: "pending",
  createdAt: NOW,
  updatedAt: NOW
};

type Double = Readonly<Record<string, ReturnType<typeof vi.fn>>>;
type Overrides = Readonly<{
  db?: Double;
  pending?: Double;
  accounts?: Double;
  transactions?: Double;
  audit?: Double;
}>;

function createService(overrides: Overrides = {}) {
  const tx = {};
  const collaborators = {
    db:
      overrides.db ??
      ({
        transaction: vi.fn(async (work: (value: object) => Promise<unknown>) => work(tx))
      } satisfies Record<string, unknown>),
    pending: overrides.pending ?? {},
    accounts: overrides.accounts ?? {},
    transactions: overrides.transactions ?? {},
    audit: overrides.audit ?? { record: vi.fn().mockResolvedValue(undefined) }
  };
  const service = new PendingTransactionService(
    focusedTestDouble(collaborators.db),
    focusedTestDouble(collaborators.pending),
    focusedTestDouble(collaborators.accounts),
    focusedTestDouble(collaborators.transactions),
    focusedTestDouble(collaborators.audit)
  );
  return { service, tx, ...collaborators };
}

describe("PendingTransactionService create and list", () => {
  it("creates a pending transaction for an active account", async () => {
    const pending = { create: vi.fn().mockResolvedValue(PENDING) };
    const accounts = {
      findById: vi.fn().mockResolvedValue({ id: ACCOUNT_ID, isArchived: false })
    };
    const context = createService({ pending, accounts });

    await expect(
      context.service.create(USER_ID, {
        accountId: ACCOUNT_ID,
        type: "expense",
        occurredAt: NOW,
        description: PENDING.description
      })
    ).resolves.toEqual(PENDING);
    expect(context.audit.record).toHaveBeenCalledWith(
      USER_ID,
      "pending_transaction.create",
      PENDING_ID,
      context.tx
    );
  });

  it("rejects a missing or archived account", async () => {
    for (const account of [null, { id: ACCOUNT_ID, isArchived: true }]) {
      const context = createService({ accounts: { findById: vi.fn().mockResolvedValue(account) } });
      await expect(
        context.service.createInTx(
          USER_ID,
          { accountId: ACCOUNT_ID, type: "expense", occurredAt: NOW, description: "x" },
          // @ts-expect-error - focused transaction double.
          context.tx
        )
      ).rejects.toBeInstanceOf(EntityNotFoundError);
    }
  });

  it("lists pending transactions by status", async () => {
    const pending = { list: vi.fn().mockResolvedValue([PENDING]) };
    const context = createService({ pending });

    await expect(context.service.list(USER_ID, "pending")).resolves.toEqual([PENDING]);
    expect(pending.list).toHaveBeenCalledWith(USER_ID, "pending");
  });
});

describe("PendingTransactionService confirm", () => {
  const resultingTransaction = focusedTestDouble<Transaction>({ id: RESULTING_TXN_ID });

  it("creates the real ledger transaction and marks the pending row confirmed", async () => {
    const confirmed = {
      ...PENDING,
      status: "confirmed" as const,
      resultingTransactionId: RESULTING_TXN_ID
    };
    const pending = {
      findById: vi.fn().mockResolvedValue(PENDING),
      markConfirmed: vi.fn().mockResolvedValue(confirmed)
    };
    const transactions = {
      create: vi.fn().mockResolvedValue({ transaction: resultingTransaction, replayed: false })
    };
    const context = createService({ pending, transactions });

    await expect(
      context.service.confirm(USER_ID, PENDING_ID, { amountMinor: 199_900 }, "key-1")
    ).resolves.toEqual(confirmed);
    expect(transactions.create).toHaveBeenCalledWith(
      USER_ID,
      {
        accountId: ACCOUNT_ID,
        type: "expense",
        amountMinor: 199_900,
        occurredAt: NOW,
        description: PENDING.description,
        tags: []
      },
      "key-1",
      "manual"
    );
    expect(pending.markConfirmed).toHaveBeenCalledWith(
      USER_ID,
      PENDING_ID,
      RESULTING_TXN_ID,
      context.tx
    );
  });

  it("rejects a missing pending transaction", async () => {
    const context = createService({ pending: { findById: vi.fn().mockResolvedValue(null) } });
    await expect(
      context.service.confirm(USER_ID, PENDING_ID, { amountMinor: 100 }, "key-1")
    ).rejects.toBeInstanceOf(EntityNotFoundError);
  });

  it("replays an already-confirmed pending transaction instead of re-creating it", async () => {
    const alreadyConfirmed = {
      ...PENDING,
      status: "confirmed" as const,
      resultingTransactionId: RESULTING_TXN_ID
    };
    const transactions = { create: vi.fn() };
    const context = createService({
      pending: { findById: vi.fn().mockResolvedValue(alreadyConfirmed) },
      transactions
    });

    await expect(
      context.service.confirm(USER_ID, PENDING_ID, { amountMinor: 100 }, "key-1")
    ).resolves.toEqual(alreadyConfirmed);
    expect(transactions.create).not.toHaveBeenCalled();
  });

  it("rejects confirming a dismissed pending transaction", async () => {
    const dismissed = { ...PENDING, status: "dismissed" as const };
    const context = createService({ pending: { findById: vi.fn().mockResolvedValue(dismissed) } });

    await expect(
      context.service.confirm(USER_ID, PENDING_ID, { amountMinor: 100 }, "key-1")
    ).rejects.toBeInstanceOf(PendingTransactionAlreadyResolvedError);
  });

  it("treats a concurrent confirm as an idempotent success", async () => {
    const concurrentlyConfirmed = {
      ...PENDING,
      status: "confirmed" as const,
      resultingTransactionId: RESULTING_TXN_ID
    };
    const pending = {
      findById: vi.fn().mockResolvedValueOnce(PENDING).mockResolvedValueOnce(concurrentlyConfirmed),
      markConfirmed: vi.fn().mockResolvedValue(null)
    };
    const transactions = {
      create: vi.fn().mockResolvedValue({ transaction: resultingTransaction, replayed: false })
    };
    const context = createService({ pending, transactions });

    await expect(
      context.service.confirm(USER_ID, PENDING_ID, { amountMinor: 199_900 }, "key-1")
    ).resolves.toEqual(concurrentlyConfirmed);
  });
});

describe("PendingTransactionService dismiss", () => {
  it("dismisses through the wrapper and audits", async () => {
    const dismissed = { ...PENDING, status: "dismissed" as const };
    const pending = { markDismissed: vi.fn().mockResolvedValue(dismissed) };
    const context = createService({ pending });

    await expect(context.service.dismiss(USER_ID, PENDING_ID)).resolves.toEqual(dismissed);
    expect(context.audit.record).toHaveBeenCalledWith(
      USER_ID,
      "pending_transaction.dismiss",
      PENDING_ID,
      context.tx
    );
  });

  it("rejects dismissing an already-resolved pending transaction", async () => {
    const context = createService({ pending: { markDismissed: vi.fn().mockResolvedValue(null) } });
    await expect(
      context.service.dismissInTx(
        USER_ID,
        PENDING_ID,
        // @ts-expect-error - focused transaction double.
        context.tx
      )
    ).rejects.toBeInstanceOf(EntityNotFoundError);
  });
});
