import type { ReceivableEvent } from "@treasury-ops/shared";
import { describe, expect, it, vi } from "vitest";

import type { DbTx } from "../../common/db/db-txn.js";
import { ReceivableReversalBlockedError } from "../../common/errors/receivable-reversal-blocked.error.js";
import { focusedTestDouble } from "../../test/mock-drizzle.js";
import { ReceivableTransactionReversalPolicy } from "../receivable-transaction-reversal-policy.js";
import type { ReceivableBalance } from "../receivable.repository.js";

const USER_ID = "user-1";
const TXN_ID = "3fa85f64-5717-4562-b3fc-2c963f66beef";
const RECEIVABLE_ID = "5b2e6e2e-9f0e-4a1a-8f2e-9c9c9c9c9c9c";
// The mock tx is opaque to the policy -- it only threads it through to the
// repository, which is itself mocked here.
const TX = focusedTestDouble<DbTx>({});

function openingEvent(amountMinor: number): ReceivableEvent {
  return {
    id: "event-1",
    receivableId: RECEIVABLE_ID,
    kind: "opening",
    amountMinor,
    occurredAt: new Date(),
    transactionId: TXN_ID,
    isReversed: false,
    createdAt: new Date()
  };
}

function balance(outstandingMinor: number): ReceivableBalance {
  return {
    outstandingMinor,
    confirmedRepaidMinor: 0,
    repaymentCount: 0,
    hasEffectiveOpening: true
  };
}

describe("ReceivableTransactionReversalPolicy", () => {
  it("allows reversal of a transaction with no linked receivable event", async () => {
    const repository = {
      findEventByTransactionId: vi.fn().mockResolvedValue(null),
      findByIdForUpdate: vi.fn(),
      getBalance: vi.fn()
    };
    // @ts-expect-error - focused policy unit test uses a repository double.
    const policy = new ReceivableTransactionReversalPolicy(repository);

    await expect(policy.assertReversalAllowed(USER_ID, TXN_ID, TX)).resolves.toBeUndefined();
    expect(repository.findByIdForUpdate).not.toHaveBeenCalled();
  });

  it("allows reversal of a repayment-linked transaction unconditionally", async () => {
    const repayment: ReceivableEvent = { ...openingEvent(2_500), kind: "repayment" };
    const repository = {
      findEventByTransactionId: vi.fn().mockResolvedValue(repayment),
      findByIdForUpdate: vi.fn(),
      getBalance: vi.fn()
    };
    // @ts-expect-error - focused policy unit test uses a repository double.
    const policy = new ReceivableTransactionReversalPolicy(repository);

    await expect(policy.assertReversalAllowed(USER_ID, TXN_ID, TX)).resolves.toBeUndefined();
    expect(repository.findByIdForUpdate).not.toHaveBeenCalled();
  });

  it("allows reversing a lend_now opening when no repayments have been made", async () => {
    const opening = openingEvent(10_000);
    const repository = {
      findEventByTransactionId: vi.fn().mockResolvedValue(opening),
      findByIdForUpdate: vi.fn().mockResolvedValue({}),
      getBalance: vi.fn().mockResolvedValue(balance(10_000))
    };
    // @ts-expect-error - focused policy unit test uses a repository double.
    const policy = new ReceivableTransactionReversalPolicy(repository);

    await expect(policy.assertReversalAllowed(USER_ID, TXN_ID, TX)).resolves.toBeUndefined();
    expect(repository.findByIdForUpdate).toHaveBeenCalledWith(USER_ID, RECEIVABLE_ID, TX);
  });

  it("blocks reversing a lend_now opening once partial repayments exist", async () => {
    const opening = openingEvent(10_000);
    const repository = {
      findEventByTransactionId: vi.fn().mockResolvedValue(opening),
      findByIdForUpdate: vi.fn().mockResolvedValue({}),
      getBalance: vi.fn().mockResolvedValue(balance(7_500))
    };
    // @ts-expect-error - focused policy unit test uses a repository double.
    const policy = new ReceivableTransactionReversalPolicy(repository);

    await expect(policy.assertReversalAllowed(USER_ID, TXN_ID, TX)).rejects.toThrow(
      ReceivableReversalBlockedError
    );
  });

  it("allows reversing a lend_now opening exactly when it would settle at zero, never below", async () => {
    const opening = openingEvent(10_000);
    const repository = {
      findEventByTransactionId: vi.fn().mockResolvedValue(opening),
      findByIdForUpdate: vi.fn().mockResolvedValue({}),
      // Outstanding equals the opening amount only when nothing else has
      // touched the receivable yet -- reversal would land exactly at zero.
      getBalance: vi.fn().mockResolvedValue(balance(10_000))
    };
    // @ts-expect-error - focused policy unit test uses a repository double.
    const policy = new ReceivableTransactionReversalPolicy(repository);

    await expect(policy.assertReversalAllowed(USER_ID, TXN_ID, TX)).resolves.toBeUndefined();
  });
});
