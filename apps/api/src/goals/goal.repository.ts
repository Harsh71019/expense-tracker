import { Inject, Injectable } from "@nestjs/common";
import {
  GoalContributionSchema,
  StoredGoalSchema,
  type CreateGoal,
  type CreateGoalContribution,
  type GoalContribution,
  type GoalId,
  type GoalStatus,
  type StoredGoal,
  type UpdateGoal
} from "@treasury-ops/shared";
import { and, asc, desc, eq, max, sql } from "drizzle-orm";

import { DATABASE_CONNECTION } from "../common/db/db.module.js";
import type { DrizzleDb } from "../common/db/db.module.js";
import { goalContributions, goals, transactions } from "../common/db/schema/index.js";
import { stripNulls } from "../common/db/strip-nulls.js";
import type { DbTx } from "../common/db/db-txn.js";

@Injectable()
export class GoalRepository {
  constructor(@Inject(DATABASE_CONNECTION) private readonly db: DrizzleDb) {}

  async create(
    userId: string,
    input: CreateGoal,
    startedMinor: number,
    priority: number,
    tx: DbTx
  ): Promise<StoredGoal> {
    const now = new Date();
    const [row] = await tx
      .insert(goals)
      .values({
        userId,
        name: input.name,
        targetMinor: input.targetMinor,
        targetDate: input.targetDate ?? null,
        fundingMode: input.fundingMode,
        linkedAccountId: input.fundingMode === "linked_account" ? input.linkedAccountId : null,
        tag: input.fundingMode === "tagged" ? input.tag : null,
        priority,
        status: "active",
        startedMinor,
        createdAt: now,
        updatedAt: now
      })
      .returning();
    if (row === undefined) throw new Error("Goal insert did not return a row.");
    return toStoredGoal(row);
  }

  async nextPriority(userId: string, tx: DbTx): Promise<number> {
    await this.lockOrdering(userId, tx);
    const [row] = await tx
      .select({ highest: max(goals.priority) })
      .from(goals)
      .where(eq(goals.userId, userId));
    return (row?.highest ?? -1) + 1;
  }

  async lockOrdering(userId: string, tx: DbTx): Promise<void> {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${userId}))`);
  }

  async list(userId: string, status: GoalStatus, tx?: DbTx): Promise<StoredGoal[]> {
    const executor = tx ?? this.db;
    const rows = await executor
      .select()
      .from(goals)
      .where(and(eq(goals.userId, userId), eq(goals.status, status)))
      .orderBy(asc(goals.priority), asc(goals.createdAt));
    return rows.map(toStoredGoal);
  }

  async findById(userId: string, goalId: GoalId, tx?: DbTx): Promise<StoredGoal | null> {
    const executor = tx ?? this.db;
    const [row] = await executor
      .select()
      .from(goals)
      .where(and(eq(goals.id, goalId), eq(goals.userId, userId)));
    return row === undefined ? null : toStoredGoal(row);
  }

  async update(
    userId: string,
    goalId: GoalId,
    patch: UpdateGoal,
    tx: DbTx
  ): Promise<StoredGoal | null> {
    const set: Record<string, unknown> = { updatedAt: new Date() };
    if (patch.name !== undefined) set.name = patch.name;
    if (patch.targetMinor !== undefined) set.targetMinor = patch.targetMinor;
    if (patch.targetDate !== undefined) set.targetDate = patch.targetDate;

    const [row] = await tx
      .update(goals)
      .set(set)
      .where(and(eq(goals.id, goalId), eq(goals.userId, userId)))
      .returning();
    return row === undefined ? null : toStoredGoal(row);
  }

  async abandon(userId: string, goalId: GoalId, tx: DbTx): Promise<boolean> {
    const rows = await tx
      .update(goals)
      .set({ status: "abandoned", updatedAt: new Date() })
      .where(and(eq(goals.id, goalId), eq(goals.userId, userId), eq(goals.status, "active")))
      .returning({ id: goals.id });
    return rows.length === 1;
  }

  async setPriority(userId: string, goalId: GoalId, priority: number, tx: DbTx): Promise<boolean> {
    const rows = await tx
      .update(goals)
      .set({ priority, updatedAt: new Date() })
      .where(and(eq(goals.id, goalId), eq(goals.userId, userId), eq(goals.status, "active")))
      .returning({ id: goals.id });
    return rows.length === 1;
  }

  async sumTaggedContributions(userId: string, tag: string, tx?: DbTx): Promise<number> {
    const executor = tx ?? this.db;
    const [row] = await executor
      .select({
        total: sql<string>`coalesce(sum(case when ${transactions.type} = 'income' then ${transactions.amountMinor} else -${transactions.amountMinor} end), 0)::bigint`
      })
      .from(transactions)
      .where(
        and(
          eq(transactions.userId, userId),
          eq(transactions.status, "posted"),
          // Receivable principal is balance-sheet movement, not a
          // goal-contribution signal, even if a user tagged it (plan §12).
          eq(transactions.purpose, "ordinary"),
          sql`${tag} = ANY(${transactions.tags})`
        )
      );
    return Number(row?.total ?? 0);
  }

  async createContribution(
    userId: string,
    goalId: GoalId,
    input: CreateGoalContribution,
    tx: DbTx
  ): Promise<GoalContribution> {
    const now = new Date();
    const [row] = await tx
      .insert(goalContributions)
      .values({
        userId,
        goalId,
        type: input.type,
        amountMinor: input.amountMinor,
        note: input.note ?? null,
        occurredAt: input.occurredAt ?? now,
        createdAt: now
      })
      .returning();
    if (row === undefined) throw new Error("Goal contribution insert did not return a row.");
    return toGoalContribution(row);
  }

  async listContributions(userId: string, goalId: GoalId, tx?: DbTx): Promise<GoalContribution[]> {
    const executor = tx ?? this.db;
    const rows = await executor
      .select()
      .from(goalContributions)
      .where(and(eq(goalContributions.userId, userId), eq(goalContributions.goalId, goalId)))
      .orderBy(desc(goalContributions.occurredAt), desc(goalContributions.createdAt));
    return rows.map(toGoalContribution);
  }

  async sumManualContributions(userId: string, goalId: GoalId, tx?: DbTx): Promise<number> {
    const executor = tx ?? this.db;
    const [row] = await executor
      .select({
        total: sql<string>`coalesce(sum(case when ${goalContributions.type} = 'deposit' then ${goalContributions.amountMinor} else -${goalContributions.amountMinor} end), 0)::bigint`
      })
      .from(goalContributions)
      .where(and(eq(goalContributions.userId, userId), eq(goalContributions.goalId, goalId)));
    return Number(row?.total ?? 0);
  }

  /**
   * Worker sweep across tenants. Every follow-up read/write is still scoped by
   * the row's userId; this query only discovers active work, like the existing
   * recurring and notification sweep repositories.
   */
  async findAllActive(): Promise<StoredGoal[]> {
    const rows = await this.db
      .select()
      .from(goals)
      .where(eq(goals.status, "active"))
      .orderBy(asc(goals.createdAt));
    return rows.map(toStoredGoal);
  }

  async markAchieved(userId: string, goalId: GoalId, tx: DbTx): Promise<boolean> {
    const rows = await tx
      .update(goals)
      .set({ status: "achieved", updatedAt: new Date() })
      .where(and(eq(goals.id, goalId), eq(goals.userId, userId), eq(goals.status, "active")))
      .returning({ id: goals.id });
    return rows.length === 1;
  }
}

function toStoredGoal(row: typeof goals.$inferSelect): StoredGoal {
  return StoredGoalSchema.parse(stripNulls(row));
}

function toGoalContribution(row: typeof goalContributions.$inferSelect): GoalContribution {
  return GoalContributionSchema.parse(stripNulls(row));
}
