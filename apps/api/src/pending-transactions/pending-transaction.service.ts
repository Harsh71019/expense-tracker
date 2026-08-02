import { Inject, Injectable } from "@nestjs/common";
import {
  type ConfirmPendingTransaction,
  type CreatePendingTransaction,
  type PendingTransaction,
  type PendingTransactionId,
  type PendingTransactionStatus
} from "@treasury-ops/shared";

import { AccountRepository } from "../accounts/account.repository.js";
import { AuditRepository } from "../audit/audit.repository.js";
import { DATABASE_CONNECTION } from "../common/db/db.module.js";
import type { DrizzleDb } from "../common/db/db.module.js";
import { withTxn } from "../common/db/db-txn.js";
import type { DbTx } from "../common/db/db-txn.js";
import { EntityNotFoundError } from "../common/errors/entity-not-found.error.js";
import { PendingTransactionAlreadyResolvedError } from "../common/errors/pending-transaction-already-resolved.error.js";
import { TransactionService } from "../transactions/transaction.service.js";
import { PendingTransactionRepository } from "./pending-transaction.repository.js";

@Injectable()
export class PendingTransactionService {
  constructor(
    @Inject(DATABASE_CONNECTION) private readonly db: DrizzleDb,
    private readonly pending: PendingTransactionRepository,
    private readonly accounts: AccountRepository,
    private readonly transactions: TransactionService,
    private readonly audit: AuditRepository
  ) {}

  create(userId: string, input: CreatePendingTransaction): Promise<PendingTransaction> {
    return withTxn(this.db, (tx) => this.createInTx(userId, input, tx));
  }

  async createInTx(
    userId: string,
    input: CreatePendingTransaction,
    tx: DbTx
  ): Promise<PendingTransaction> {
    const account = await this.accounts.findById(userId, input.accountId, tx);
    if (account === null || account.isArchived) throw new EntityNotFoundError("Account");

    const created = await this.pending.create(userId, input, tx);
    await this.audit.record(userId, "pending_transaction.create", created.id, tx);
    return created;
  }

  list(userId: string, status: PendingTransactionStatus): Promise<PendingTransaction[]> {
    return this.pending.list(userId, status);
  }

  /**
   * Deliberately does not go through IdempotencyPostgresService: the
   * underlying ledger write (transactions.create) already opens its own
   * top-level transaction and already has its own idempotency-key column,
   * exactly like TransactionController.create bypasses
   * TransactionMutationService for the same reason. Wrapping this in a
   * second, outer withTxn/idempotency layer would just open a second,
   * unrelated Postgres transaction around the ledger write rather than
   * nesting inside it.
   */
  async confirm(
    userId: string,
    id: PendingTransactionId,
    input: ConfirmPendingTransaction,
    idempotencyKey: string
  ): Promise<PendingTransaction> {
    const existing = await this.pending.findById(userId, id);
    if (existing === null) throw new EntityNotFoundError("Pending transaction");
    if (existing.status === "confirmed") return existing;
    if (existing.status !== "pending") throw new PendingTransactionAlreadyResolvedError();

    const created = await this.transactions.create(
      userId,
      {
        accountId: existing.accountId,
        type: existing.type,
        amountMinor: input.amountMinor,
        occurredAt: existing.occurredAt,
        description: existing.description,
        tags: []
      },
      idempotencyKey,
      "manual"
    );

    const updated = await withTxn(this.db, (tx) =>
      this.pending.markConfirmed(userId, id, created.transaction.id, tx)
    );
    if (updated === null) {
      const refreshed = await this.pending.findById(userId, id);
      if (refreshed === null) throw new EntityNotFoundError("Pending transaction");
      return refreshed;
    }

    await withTxn(this.db, (tx) =>
      this.audit.record(userId, "pending_transaction.confirm", id, tx, {
        resultingTransactionId: created.transaction.id
      })
    );
    return updated;
  }

  dismiss(userId: string, id: PendingTransactionId): Promise<PendingTransaction> {
    return withTxn(this.db, (tx) => this.dismissInTx(userId, id, tx));
  }

  async dismissInTx(
    userId: string,
    id: PendingTransactionId,
    tx: DbTx
  ): Promise<PendingTransaction> {
    const updated = await this.pending.markDismissed(userId, id, tx);
    if (updated === null) throw new EntityNotFoundError("Pending transaction");
    await this.audit.record(userId, "pending_transaction.dismiss", id, tx);
    return updated;
  }
}
