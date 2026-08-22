import type { Transaction } from "@treasury-ops/shared";

import type { DbTx } from "../common/db/db-txn.js";

export const TRANSACTION_REVERSAL_HOOK = Symbol("TRANSACTION_REVERSAL_HOOK");

export interface TransactionReversalHook {
  onTransactionReversedInTx(
    userId: string,
    original: Transaction,
    reversal: Transaction,
    tx: DbTx
  ): Promise<void>;
}
