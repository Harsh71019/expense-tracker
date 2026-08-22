import { Injectable } from "@nestjs/common";

import type { DbTx } from "../common/db/db-txn.js";
import { ReceivableReversalBlockedError } from "../common/errors/receivable-reversal-blocked.error.js";
import type { TransactionReversalPolicy } from "../transactions/transaction-reversal-policy.js";
import { ReceivableRepository } from "./receivable.repository.js";

/**
 * Implements `TransactionReversalPolicy` (declared in `transactions/`, the
 * module being extended) so reversing a transaction linked to a receivable
 * opening cannot drive that receivable's outstanding amount negative --
 * plan doc §11. Bound to `TRANSACTION_REVERSAL_POLICY` by
 * `ReceivableTransactionReversalPolicyModule` rather than being provided
 * directly by `ReceivablesModule`, mirroring how `TRANSACTION_CREATED_HOOK`
 * is bound so `TransactionsModule` never imports `ReceivablesModule`.
 */
@Injectable()
export class ReceivableTransactionReversalPolicy implements TransactionReversalPolicy {
  constructor(private readonly receivables: ReceivableRepository) {}

  async assertReversalAllowed(userId: string, transactionId: string, tx: DbTx): Promise<void> {
    const event = await this.receivables.findEventByTransactionId(userId, transactionId, tx);
    if (event === null || event.kind !== "opening") return;

    await this.receivables.findByIdForUpdate(userId, event.receivableId, tx);
    const balance = await this.receivables.getBalance(userId, event.receivableId, tx);
    if (balance.outstandingMinor - event.amountMinor < 0) {
      throw new ReceivableReversalBlockedError();
    }
  }
}
