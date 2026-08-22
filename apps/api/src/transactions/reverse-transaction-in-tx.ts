import type { Transaction, TransactionId } from "@treasury-ops/shared";

import type { AccountRepository } from "../accounts/account.repository.js";
import { assertBalanceDeltaApplied } from "../accounts/balance-delta.js";
import type { AuditRepository } from "../audit/audit.repository.js";
import type { DbTx } from "../common/db/db-txn.js";
import { EntityNotFoundError } from "../common/errors/entity-not-found.error.js";
import { TransactionNotReversibleError } from "../common/errors/transaction-not-reversible.error.js";
import type { TransactionRepository } from "./transaction.repository.js";
import type { TransactionReversalHook } from "./transaction-reversal-hook.js";

export type ReverseTransactionDeps = Readonly<{
  transactions: TransactionRepository;
  accounts: AccountRepository;
  audit: AuditRepository;
  reversalHook: TransactionReversalHook;
}>;

/**
 * The shared core of "reverse a posted transaction, in one Postgres
 * transaction" -- lifted out of `TransactionService` into a plain function
 * (rather than a method other services inject the service class to call)
 * so `RecurringReconciliationService` can reverse a transaction without
 * depending on `TransactionService` itself. That dependency would be
 * circular: `TransactionService.create` notifies
 * `RecurringReconciliationService` via `TRANSACTION_CREATED_HOOK`, and
 * `RecurringReconciliationService` would in turn depend back on
 * `TransactionService` to reverse a match. Nest's static circular-dependency
 * detection doesn't see that cycle (it's indirected through a token bound
 * in a third, `@Global()` module), so instead of throwing a clear error it
 * deadlocks during instantiation -- confirmed as the cause of
 * `bootstrap.integration.ts` hanging in CI. Depending on the plain
 * repositories here (already exported one-way from `TransactionsModule`/
 * `AccountsModule`) instead of `TransactionService` removes the cycle
 * entirely.
 */
export async function reverseTransactionInTx(
  deps: ReverseTransactionDeps,
  userId: string,
  transactionId: TransactionId,
  tx: DbTx
): Promise<Transaction> {
  const original = await deps.transactions.findPostedById(userId, transactionId, tx);
  if (original === null) {
    const existing = await deps.transactions.findById(userId, transactionId, tx);
    if (existing === null) throw new EntityNotFoundError("Transaction");
    throw new TransactionNotReversibleError();
  }

  const reversal = await deps.transactions.createReversal(userId, original, tx);
  if (!(await deps.transactions.markReversed(userId, original.id, reversal.id, tx))) {
    throw new TransactionNotReversibleError();
  }

  const deltaMinor = original.type === "expense" ? original.amountMinor : -original.amountMinor;
  assertBalanceDeltaApplied(
    await deps.accounts.applyReversalBalanceDelta(userId, original.accountId, deltaMinor, tx)
  );

  await deps.audit.record(userId, "transaction.reverse", reversal.id, tx);
  await deps.reversalHook.onTransactionReversedInTx(userId, original, reversal, tx);
  return reversal;
}
