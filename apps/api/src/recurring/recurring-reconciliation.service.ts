import { Inject, Injectable } from "@nestjs/common";
import { ModuleRef } from "@nestjs/core";
import {
  RecurringReconciliationSchema,
  type RecurringReconciliation,
  type RecurringReconciliationId,
  type RecurringReconciliationReviewItem,
  type ResolveRecurringReconciliation,
  type Transaction
} from "@treasury-ops/shared";
import { Logger } from "nestjs-pino";

import { AccountRepository } from "../accounts/account.repository.js";
import { AuditRepository } from "../audit/audit.repository.js";
import { DATABASE_CONNECTION } from "../common/db/db.module.js";
import type { DrizzleDb } from "../common/db/db.module.js";
import { withTxn } from "../common/db/db-txn.js";
import type { DbTx } from "../common/db/db-txn.js";
import { EntityNotFoundError } from "../common/errors/entity-not-found.error.js";
import { InvalidReconciliationResolutionError } from "../common/errors/invalid-reconciliation-resolution.error.js";
import { ReconciliationAlreadyResolvedError } from "../common/errors/reconciliation-already-resolved.error.js";
import {
  IdempotencyPostgresService,
  type IdempotentResult
} from "../common/idempotency/idempotency-postgres.service.js";
import { LogEvent } from "../common/logging/events.js";
import { NotificationOutboxRepository } from "../notifications/notification-outbox.repository.js";
import { reverseTransactionInTx } from "../transactions/reverse-transaction-in-tx.js";
import { TransactionRepository } from "../transactions/transaction.repository.js";
import type { TransactionCreatedHook } from "../transactions/transaction-created-hook.js";
import {
  TRANSACTION_REVERSAL_HOOK,
  type TransactionReversalHook
} from "../transactions/transaction-reversal-hook.js";
import {
  RECONCILIATION_WINDOW_DAYS,
  matchIncomingTransaction
} from "./recurring-reconciliation-matcher.js";
import { RecurringOccurrenceRepository } from "./recurring-occurrence.repository.js";
import { RecurringReconciliationRepository } from "./recurring-reconciliation.repository.js";

type ReconciliationLogger = Pick<Logger, "log" | "error">;
type ReversalHookResolver = Readonly<{
  get(
    token: typeof TRANSACTION_REVERSAL_HOOK,
    options: Readonly<{ strict: false }>
  ): TransactionReversalHook;
}>;

@Injectable()
export class RecurringReconciliationService implements TransactionCreatedHook {
  constructor(
    @Inject(DATABASE_CONNECTION) private readonly db: DrizzleDb,
    private readonly transactions: TransactionRepository,
    private readonly accounts: AccountRepository,
    private readonly reconciliations: RecurringReconciliationRepository,
    private readonly occurrences: RecurringOccurrenceRepository,
    private readonly notifications: NotificationOutboxRepository,
    private readonly audit: AuditRepository,
    private readonly idempotency: IdempotencyPostgresService,
    @Inject(Logger) private readonly logger: ReconciliationLogger,
    @Inject(ModuleRef) private readonly moduleRef: ReversalHookResolver
  ) {}

  private reverseInTx(userId: string, transactionId: string, tx: DbTx) {
    const reversalHook = this.moduleRef.get(TRANSACTION_REVERSAL_HOOK, {
      strict: false
    });
    return reverseTransactionInTx(
      {
        transactions: this.transactions,
        accounts: this.accounts,
        audit: this.audit,
        reversalHook
      },
      userId,
      transactionId,
      tx
    );
  }

  async onTransactionCreatedInTx(userId: string, incoming: Transaction, tx: DbTx): Promise<void> {
    await this.reconcileIncomingInTx(userId, incoming, tx);
  }

  async reconcileIncoming(userId: string, incoming: Transaction): Promise<void> {
    try {
      await withTxn(this.db, (tx) => this.reconcileIncomingInTx(userId, incoming, tx));
    } catch (error) {
      const existing = await this.reconciliations.findByIncomingTransactionId(userId, incoming.id);
      if (existing === null) throw error;
    }
  }

  private async reconcileIncomingInTx(
    userId: string,
    incoming: Transaction,
    tx: DbTx
  ): Promise<void> {
    const existing = await this.reconciliations.findByIncomingTransactionId(
      userId,
      incoming.id,
      tx
    );
    if (existing !== null) return;

    const candidates = await this.reconciliations.findUnreconciledRecurringCandidates(
      userId,
      incoming.accountId,
      incoming.occurredAt,
      RECONCILIATION_WINDOW_DAYS,
      tx
    );
    const match = matchIncomingTransaction(
      {
        accountId: incoming.accountId,
        type: incoming.type,
        amountMinor: incoming.amountMinor,
        occurredAt: incoming.occurredAt,
        description: incoming.description
      },
      candidates
    );

    if (match.outcome === "no_match") {
      await this.tryConfirmExpectedOccurrence(userId, incoming, tx);
      return;
    }

    if (match.outcome === "auto_matched") {
      await this.reverseInTx(userId, match.recurringTransactionId, tx);
      await this.reconciliations.create(
        userId,
        {
          incomingTransactionId: incoming.id,
          recurringRuleId: match.recurringRuleId,
          recurringTransactionId: match.recurringTransactionId,
          candidateRecurringTransactionIds: [match.recurringTransactionId],
          status: "auto_matched"
        },
        tx
      );
      await this.audit.record(userId, "recurring.reconciliation.auto_matched", incoming.id, tx, {
        recurringTransactionId: match.recurringTransactionId
      });
      this.logger.log(
        {
          event: LogEvent.RecurringReconciliationAutoMatched,
          incomingTransactionId: incoming.id,
          recurringTransactionId: match.recurringTransactionId
        },
        "recurring transaction auto-reconciled"
      );
      return;
    }

    await this.reconciliations.create(
      userId,
      {
        incomingTransactionId: incoming.id,
        candidateRecurringTransactionIds: match.candidateTransactionIds,
        status: match.outcome
      },
      tx
    );
    await this.notifications.enqueue(
      userId,
      "recurring_reconciliation_pending",
      {
        incomingTransactionId: incoming.id,
        status: match.outcome,
        candidateTransactionIds: match.candidateTransactionIds
      },
      tx
    );
    await this.audit.record(userId, "recurring.reconciliation.flagged", incoming.id, tx, {
      status: match.outcome,
      candidateTransactionIds: match.candidateTransactionIds
    });
    this.logger.log(
      {
        event: LogEvent.RecurringReconciliationFlagged,
        incomingTransactionId: incoming.id,
        status: match.outcome
      },
      "recurring transaction flagged for reconciliation"
    );
  }

  /**
   * The counterpart to the placeholder-reconciliation path above, for
   * manual-post recurring rules: those never materialize a `source:
   * "recurring"` transaction to reconcile against, so
   * findUnreconciledRecurringCandidates above always returns nothing for
   * them. Instead this matches the incoming transaction against still-
   * `expected` RecurringOccurrence rows (RecurringMaterializeService creates
   * one per due manual-post occurrence instead of a ledger transaction).
   * Reuses matchIncomingTransaction unchanged — see
   * RecurringOccurrenceRepository.findPendingCandidatesForMatching's comment
   * for why its `transactionId` field holds an occurrence id here, not a
   * transaction id. Only a clean `auto_matched` result acts; `ambiguous`/
   * `amount_mismatch` deliberately fall through and leave the occurrence
   * `expected` for the user to link by hand from the transaction detail
   * panel, rather than growing a second review-queue table for this path.
   */
  private async tryConfirmExpectedOccurrence(
    userId: string,
    incoming: Transaction,
    tx: DbTx
  ): Promise<void> {
    const candidates = await this.occurrences.findPendingCandidatesForMatching(
      userId,
      incoming.accountId,
      incoming.occurredAt,
      RECONCILIATION_WINDOW_DAYS,
      tx
    );
    const match = matchIncomingTransaction(
      {
        accountId: incoming.accountId,
        type: incoming.type,
        amountMinor: incoming.amountMinor,
        occurredAt: incoming.occurredAt,
        description: incoming.description
      },
      candidates
    );
    if (match.outcome !== "auto_matched") return;
    const occurrenceId = match.recurringTransactionId;

    const attached = await this.transactions.attachToRecurringRule(
      userId,
      incoming.id,
      match.recurringRuleId,
      tx
    );
    if (attached === null) return;
    const occurrence = await this.occurrences.confirm(userId, occurrenceId, incoming.id, tx);
    if (occurrence === null) return;
    await this.audit.record(userId, "recurring.occurrence.auto_confirmed", occurrenceId, tx, {
      ruleId: match.recurringRuleId,
      transactionId: incoming.id
    });

    this.logger.log(
      {
        event: LogEvent.RecurringOccurrenceAutoConfirmed,
        incomingTransactionId: incoming.id,
        occurrenceId
      },
      "recurring occurrence auto-confirmed"
    );
  }

  /**
   * A bare `RecurringReconciliation` only carries transaction ids -- not
   * enough for a human to judge "is this really the same charge" -- so this
   * populates the incoming and candidate transactions at read time. Pending
   * rows are expected to be few (an exception queue, not a ledger view), so
   * one lookup per referenced transaction is simpler than adding a batch
   * fetch method to TransactionRepository for this one caller.
   */
  async listPending(userId: string): Promise<RecurringReconciliationReviewItem[]> {
    const rows = await this.reconciliations.findPending(userId);
    const items: RecurringReconciliationReviewItem[] = [];
    for (const row of rows) {
      const incomingTransaction = await this.transactions.findById(
        userId,
        row.incomingTransactionId
      );
      if (incomingTransaction === null) continue;
      const candidateTransactions = await this.findCandidateTransactions(userId, row);
      items.push({ ...row, incomingTransaction, candidateTransactions });
    }
    return items;
  }

  private async findCandidateTransactions(
    userId: string,
    row: RecurringReconciliation
  ): Promise<Transaction[]> {
    const transactions: Transaction[] = [];
    for (const candidateId of row.candidateRecurringTransactionIds) {
      const candidate = await this.transactions.findById(userId, candidateId);
      if (candidate !== null) transactions.push(candidate);
    }
    return transactions;
  }

  resolve(
    userId: string,
    id: RecurringReconciliationId,
    input: ResolveRecurringReconciliation,
    idempotencyKey: string
  ): Promise<IdempotentResult<RecurringReconciliation>> {
    return this.idempotency.execute(
      userId,
      "recurring.reconciliation.resolve",
      idempotencyKey,
      { id, input },
      RecurringReconciliationSchema,
      async (tx) => {
        const row = await this.reconciliations.findById(userId, id, tx);
        if (row === null) throw new EntityNotFoundError("Recurring reconciliation");
        if (row.resolution !== undefined) throw new ReconciliationAlreadyResolvedError();
        if (row.status === "auto_matched") {
          throw new InvalidReconciliationResolutionError(
            "This reconciliation was already auto-matched and does not need review."
          );
        }

        const target = resolveTargetTransactionId(row, input);
        if (input.resolution === "confirmed_duplicate" && target !== undefined) {
          await this.reverseInTx(userId, target, tx);
        }
        const resolved = await this.reconciliations.resolve(userId, id, input.resolution, tx);
        if (resolved === null) throw new EntityNotFoundError("Recurring reconciliation");
        await this.audit.record(userId, "recurring.reconciliation.resolve", id, tx, {
          resolution: input.resolution,
          ...(target === undefined ? {} : { reversedTransactionId: target })
        });
        return resolved;
      }
    );
  }
}

function resolveTargetTransactionId(
  row: RecurringReconciliation,
  input: ResolveRecurringReconciliation
): string | undefined {
  if (input.resolution !== "confirmed_duplicate") return undefined;

  if (row.candidateRecurringTransactionIds.length === 1) {
    const [only] = row.candidateRecurringTransactionIds;
    if (
      input.chosenRecurringTransactionId !== undefined &&
      input.chosenRecurringTransactionId !== only
    ) {
      throw new InvalidReconciliationResolutionError(
        "chosenRecurringTransactionId does not match this reconciliation's only candidate."
      );
    }
    return only;
  }

  if (input.chosenRecurringTransactionId === undefined) {
    throw new InvalidReconciliationResolutionError(
      "chosenRecurringTransactionId is required when confirming a duplicate with multiple candidates."
    );
  }
  if (!row.candidateRecurringTransactionIds.includes(input.chosenRecurringTransactionId)) {
    throw new InvalidReconciliationResolutionError(
      "chosenRecurringTransactionId is not one of this reconciliation's candidates."
    );
  }
  return input.chosenRecurringTransactionId;
}
