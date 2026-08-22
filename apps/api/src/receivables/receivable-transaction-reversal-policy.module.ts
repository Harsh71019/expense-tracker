import { Global, Module } from "@nestjs/common";

import { TRANSACTION_REVERSAL_POLICY } from "../transactions/transaction-reversal-policy.js";
import { ReceivableTransactionReversalPolicy } from "./receivable-transaction-reversal-policy.js";
import { ReceivablesModule } from "./receivables.module.js";

/**
 * Binds `TRANSACTION_REVERSAL_POLICY` (declared in `transactions/`, the
 * module being extended) to `ReceivableTransactionReversalPolicy` (declared
 * in `receivables/`, which already imports `TransactionsModule` -- the
 * reverse import would be circular). `@Global()` makes the binding visible
 * to `TransactionService`'s and `RecurringReconciliationService`'s own
 * injectors without `TransactionsModule` ever importing `ReceivablesModule`,
 * mirroring `TransactionReconciliationHookModule`.
 */
@Global()
@Module({
  imports: [ReceivablesModule],
  providers: [
    { provide: TRANSACTION_REVERSAL_POLICY, useExisting: ReceivableTransactionReversalPolicy }
  ],
  exports: [TRANSACTION_REVERSAL_POLICY]
})
export class ReceivableTransactionReversalPolicyModule {}
