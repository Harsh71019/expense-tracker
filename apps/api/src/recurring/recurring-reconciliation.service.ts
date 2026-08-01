import { Inject, Injectable } from "@nestjs/common";
import {
  RecurringReconciliationSchema,
  type RecurringReconciliation,
  type RecurringReconciliationId,
  type ResolveRecurringReconciliation,
  type Transaction
} from "@treasury-ops/shared";
import { Logger } from "nestjs-pino";

import { AuditRepository } from "../audit/audit.repository.js";
import { DATABASE_CONNECTION } from "../common/db/db.module.js";
import type { DrizzleDb } from "../common/db/db.module.js";
import { withTxn } from "../common/db/db-txn.js";
import { EntityNotFoundError } from "../common/errors/entity-not-found.error.js";
import { InvalidReconciliationResolutionError } from "../common/errors/invalid-reconciliation-resolution.error.js";
import { ReconciliationAlreadyResolvedError } from "../common/errors/reconciliation-already-resolved.error.js";
import {
  IdempotencyPostgresService,
  type IdempotentResult
} from "../common/idempotency/idempotency-postgres.service.js";
import { LogEvent } from "../common/logging/events.js";
import { NotificationOutboxRepository } from "../notifications/notification-outbox.repository.js";
import { TransactionService } from "../transactions/transaction.service.js";
import type { TransactionCreatedHook } from "../transactions/transaction-created-hook.js";
import {
  RECONCILIATION_WINDOW_DAYS,
  matchIncomingTransaction
} from "./recurring-reconciliation-matcher.js";
import { RecurringReconciliationRepository } from "./recurring-reconciliation.repository.js";

type ReconciliationLogger = Pick<Logger, "log" | "error">;

@Injectable()
export class RecurringReconciliationService implements TransactionCreatedHook {
  constructor(
    @Inject(DATABASE_CONNECTION) private readonly db: DrizzleDb,
    private readonly transactions: TransactionService,
    private readonly reconciliations: RecurringReconciliationRepository,
    private readonly notifications: NotificationOutboxRepository,
    private readonly audit: AuditRepository,
    private readonly idempotency: IdempotencyPostgresService,
    @Inject(Logger) private readonly logger: ReconciliationLogger
  ) {}

  async onTransactionCreated(userId: string, incoming: Transaction): Promise<void> {
    await this.reconcileIncoming(userId, incoming);
  }

  async reconcileIncoming(userId: string, incoming: Transaction): Promise<void> {
    const candidates = await this.reconciliations.findUnreconciledRecurringCandidates(
      userId,
      incoming.accountId,
      incoming.occurredAt,
      RECONCILIATION_WINDOW_DAYS
    );
    const match = matchIncomingTransaction(
      {
        accountId: incoming.accountId,
        type: incoming.type,
        amountMinor: incoming.amountMinor,
        occurredAt: incoming.occurredAt
      },
      candidates
    );

    if (match.outcome === "no_match") return;

    if (match.outcome === "auto_matched") {
      await withTxn(this.db, async (tx) => {
        await this.transactions.reverseInTx(userId, match.recurringTransactionId, tx);
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

    await withTxn(this.db, async (tx) => {
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

  listPending(userId: string): Promise<RecurringReconciliation[]> {
    return this.reconciliations.findPending(userId);
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
          await this.transactions.reverseInTx(userId, target, tx);
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
