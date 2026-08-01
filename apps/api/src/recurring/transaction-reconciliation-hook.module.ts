import { Global, Module } from "@nestjs/common";

import { TRANSACTION_CREATED_HOOK } from "../transactions/transaction-created-hook.js";
import { RecurringModule } from "./recurring.module.js";
import { RecurringReconciliationService } from "./recurring-reconciliation.service.js";

/**
 * Binds `TRANSACTION_CREATED_HOOK` (declared in `transactions/`, the module
 * being extended) to `RecurringReconciliationService` (declared in
 * `recurring/`, which already imports `TransactionsModule` -- the reverse
 * import would be circular). `@Global()` is what makes the binding visible
 * to `TransactionService`'s own injector without `TransactionsModule` ever
 * importing `RecurringModule` itself, mirroring how `AuditModule`/
 * `NotificationsModule` make their providers available repo-wide.
 */
@Global()
@Module({
  imports: [RecurringModule],
  providers: [{ provide: TRANSACTION_CREATED_HOOK, useExisting: RecurringReconciliationService }],
  exports: [TRANSACTION_CREATED_HOOK]
})
export class TransactionReconciliationHookModule {}
