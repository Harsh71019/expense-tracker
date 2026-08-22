import type { DbTx } from "../common/db/db-txn.js";

/**
 * Extension point for a module to veto reversing a specific transaction
 * without `TransactionsModule` importing that module (see
 * `TRANSACTION_REVERSAL_POLICY`'s binding site for why). Implementations
 * throw a domain error to block the reversal; returning normally allows it.
 */
export interface TransactionReversalPolicy {
  assertReversalAllowed(userId: string, transactionId: string, tx: DbTx): Promise<void>;
}

export const TRANSACTION_REVERSAL_POLICY = Symbol("TRANSACTION_REVERSAL_POLICY");
