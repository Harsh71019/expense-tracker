import { Inject, Injectable } from "@nestjs/common";
import {
  RecurringReconciliationSchema,
  type RecurringReconciliation,
  type RecurringReconciliationId,
  type RecurringReconciliationResolution,
  type RecurringReconciliationStatus,
  type RecurringRuleId,
  type TransactionId
} from "@treasury-ops/shared";
import { and, eq, gte, inArray, lte } from "drizzle-orm";

import { DATABASE_CONNECTION } from "../common/db/db.module.js";
import type { DrizzleDb } from "../common/db/db.module.js";
import {
  recurringReconciliations,
  recurringRules,
  transactions
} from "../common/db/schema/index.js";
import { stripNulls } from "../common/db/strip-nulls.js";
import type { DbTx } from "../common/db/db-txn.js";
import type { RecurringCandidate } from "./recurring-reconciliation-matcher.js";

export type NewRecurringReconciliation = Readonly<{
  incomingTransactionId: TransactionId;
  recurringRuleId?: RecurringRuleId;
  recurringTransactionId?: TransactionId;
  candidateRecurringTransactionIds: readonly TransactionId[];
  status: RecurringReconciliationStatus;
}>;

@Injectable()
export class RecurringReconciliationRepository {
  constructor(@Inject(DATABASE_CONNECTION) private readonly db: DrizzleDb) {}

  /**
   * Candidates for the matcher: this account/type's `posted`, `recurring`-
   * sourced transactions within `windowDays` of `occurredAt`, excluding any
   * transaction already referenced by an earlier reconciliation row (either
   * as the settled match or as one of an ambiguous set's candidates) --
   * flattened and filtered in application code (mirrors
   * BillStatementRepository.findMatchedTransactionIds) rather than an
   * unnest() in SQL, to keep this on the plain query builder.
   */
  async findUnreconciledRecurringCandidates(
    userId: string,
    accountId: string,
    occurredAt: Date,
    windowDays: number,
    tx?: DbTx
  ): Promise<RecurringCandidate[]> {
    const executor = tx ?? this.db;
    const windowMs = windowDays * 24 * 60 * 60 * 1_000;
    const rows = await executor
      .select({
        id: transactions.id,
        recurringRuleId: transactions.recurringRuleId,
        accountId: transactions.accountId,
        type: transactions.type,
        amountMinor: transactions.amountMinor,
        occurredAt: transactions.occurredAt,
        templateDescription: recurringRules.templateDescription
      })
      .from(transactions)
      .innerJoin(recurringRules, eq(recurringRules.id, transactions.recurringRuleId))
      .where(
        and(
          eq(transactions.userId, userId),
          eq(transactions.accountId, accountId),
          eq(transactions.source, "recurring"),
          eq(transactions.status, "posted"),
          gte(transactions.occurredAt, new Date(occurredAt.getTime() - windowMs)),
          lte(transactions.occurredAt, new Date(occurredAt.getTime() + windowMs))
        )
      );

    const alreadyConsidered = await this.findConsideredTransactionIds(userId, tx);

    return rows
      .filter((row) => row.recurringRuleId !== null && !alreadyConsidered.has(row.id))
      .map((row) => {
        if (row.recurringRuleId === null) throw new Error("unreachable: filtered above");
        return {
          transactionId: row.id,
          ruleId: row.recurringRuleId,
          accountId: row.accountId,
          type: row.type,
          amountMinor: row.amountMinor,
          occurredAt: row.occurredAt,
          templateDescription: row.templateDescription
        };
      });
  }

  private async findConsideredTransactionIds(
    userId: string,
    tx?: DbTx
  ): Promise<Set<TransactionId>> {
    const executor = tx ?? this.db;
    const rows = await executor
      .select({
        recurringTransactionId: recurringReconciliations.recurringTransactionId,
        candidateRecurringTransactionIds: recurringReconciliations.candidateRecurringTransactionIds
      })
      .from(recurringReconciliations)
      .where(eq(recurringReconciliations.userId, userId));

    const ids = new Set<TransactionId>();
    for (const row of rows) {
      if (row.recurringTransactionId !== null) ids.add(row.recurringTransactionId);
      for (const candidateId of row.candidateRecurringTransactionIds) ids.add(candidateId);
    }
    return ids;
  }

  async create(userId: string, row: NewRecurringReconciliation, tx: DbTx): Promise<void> {
    const now = new Date();
    await tx.insert(recurringReconciliations).values({
      userId,
      incomingTransactionId: row.incomingTransactionId,
      recurringRuleId: row.recurringRuleId ?? null,
      recurringTransactionId: row.recurringTransactionId ?? null,
      candidateRecurringTransactionIds: [...row.candidateRecurringTransactionIds],
      status: row.status,
      createdAt: now,
      updatedAt: now
    });
  }

  async findPending(userId: string): Promise<RecurringReconciliation[]> {
    const rows = await this.db
      .select()
      .from(recurringReconciliations)
      .where(
        and(
          eq(recurringReconciliations.userId, userId),
          inArray(recurringReconciliations.status, ["ambiguous", "amount_mismatch"])
        )
      );
    return rows
      .filter((row) => row.resolution === null)
      .map((row) => toRecurringReconciliation(row));
  }

  async findById(
    userId: string,
    id: RecurringReconciliationId,
    tx?: DbTx
  ): Promise<RecurringReconciliation | null> {
    const executor = tx ?? this.db;
    const [row] = await executor
      .select()
      .from(recurringReconciliations)
      .where(and(eq(recurringReconciliations.id, id), eq(recurringReconciliations.userId, userId)));
    return row === undefined ? null : toRecurringReconciliation(row);
  }

  async findByIncomingTransactionId(
    userId: string,
    incomingTransactionId: TransactionId,
    tx?: DbTx
  ): Promise<RecurringReconciliation | null> {
    const executor = tx ?? this.db;
    const [row] = await executor
      .select()
      .from(recurringReconciliations)
      .where(
        and(
          eq(recurringReconciliations.userId, userId),
          eq(recurringReconciliations.incomingTransactionId, incomingTransactionId)
        )
      );
    return row === undefined ? null : toRecurringReconciliation(row);
  }

  async resolve(
    userId: string,
    id: RecurringReconciliationId,
    resolution: RecurringReconciliationResolution,
    tx: DbTx
  ): Promise<RecurringReconciliation | null> {
    const [row] = await tx
      .update(recurringReconciliations)
      .set({ resolution, resolvedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(recurringReconciliations.id, id), eq(recurringReconciliations.userId, userId)))
      .returning();
    return row === undefined ? null : toRecurringReconciliation(row);
  }
}

function toRecurringReconciliation(row: typeof recurringReconciliations.$inferSelect) {
  const stripped = stripNulls(row);
  return RecurringReconciliationSchema.parse({
    id: row.id,
    userId: row.userId,
    incomingTransactionId: row.incomingTransactionId,
    recurringRuleId: stripped.recurringRuleId,
    recurringTransactionId: stripped.recurringTransactionId,
    candidateRecurringTransactionIds: row.candidateRecurringTransactionIds,
    status: row.status,
    resolution: stripped.resolution,
    resolvedAt: stripped.resolvedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  });
}
