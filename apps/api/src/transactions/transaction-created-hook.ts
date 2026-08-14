import type { Transaction } from "@treasury-ops/shared";

import type { DbTx } from "../common/db/db-txn.js";

/**
 * A DI seam so `TransactionService` can notify the recurring reconciliation
 * flow about freshly-created API-sourced transactions without importing
 * `RecurringModule` directly -- module dependencies in this repo flow one
 * way (`recurring` already imports `transactions`), so the binding for this
 * token is registered from the `recurring` side instead (see
 * `recurring/transaction-reconciliation-hook.module.ts`), mirroring the
 * injected-interface pattern described for `imports`/`income` in
 * SALARY-MODULE.md §9.
 */
export const TRANSACTION_CREATED_HOOK = Symbol("TRANSACTION_CREATED_HOOK");

export interface TransactionCreatedHook {
  onTransactionCreatedInTx(userId: string, transaction: Transaction, tx: DbTx): Promise<void>;
}
