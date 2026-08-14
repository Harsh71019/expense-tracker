import { Inject, Injectable } from "@nestjs/common";
import {
  GoalSchema,
  type CreateGoal,
  type CreateGoalContribution,
  type Goal,
  type GoalContribution,
  type GoalId,
  type GoalPlan,
  type GoalStatus,
  type ReorderGoals,
  type StoredGoal,
  type UpdateGoal
} from "@treasury-ops/shared";

import { AccountRepository } from "../accounts/account.repository.js";
import { AuditRepository } from "../audit/audit.repository.js";
import { DATABASE_CONNECTION } from "../common/db/db.module.js";
import type { DrizzleDb } from "../common/db/db.module.js";
import { withTxn } from "../common/db/db-txn.js";
import type { DbTx } from "../common/db/db-txn.js";
import { postgresConstraint } from "../common/db/postgres-error.js";
import { EntityNotFoundError } from "../common/errors/entity-not-found.error.js";
import { GoalFundingSourceInUseError } from "../common/errors/goal-funding-source-in-use.error.js";
import { InvalidGoalOrderError } from "../common/errors/invalid-goal-order.error.js";
import { calculateGoalPlan } from "./goal-plan.js";
import { GoalRepository } from "./goal.repository.js";

const FUNDING_SOURCE_CONSTRAINTS = new Set([
  "goals_user_id_tag_unique",
  "goals_linked_account_id_unique"
]);

@Injectable()
export class GoalService {
  constructor(
    @Inject(DATABASE_CONNECTION) private readonly db: DrizzleDb,
    private readonly goals: GoalRepository,
    private readonly accounts: AccountRepository,
    private readonly audit: AuditRepository
  ) {}

  create(userId: string, input: CreateGoal): Promise<Goal> {
    return withTxn(this.db, (tx) => this.createInTx(userId, input, tx));
  }

  async createInTx(userId: string, input: CreateGoal, tx: DbTx): Promise<Goal> {
    let startedMinor = 0;
    if (input.fundingMode === "linked_account") {
      const account = await this.accounts.findById(userId, input.linkedAccountId, tx);
      if (account === null || account.isArchived) throw new EntityNotFoundError("Account");
      startedMinor = account.balanceMinor;
    }

    const priority = await this.goals.nextPriority(userId, tx);
    let stored: StoredGoal;
    try {
      stored = await this.goals.create(userId, input, startedMinor, priority, tx);
    } catch (error) {
      if (FUNDING_SOURCE_CONSTRAINTS.has(postgresConstraint(error) ?? "")) {
        throw new GoalFundingSourceInUseError();
      }
      throw error;
    }

    await this.audit.record(userId, "goal.create", stored.id, tx, {
      fundingMode: stored.fundingMode,
      targetMinor: stored.targetMinor
    });
    return this.withProgress(userId, stored, tx);
  }

  async list(userId: string, status: GoalStatus): Promise<Goal[]> {
    const stored = await this.goals.list(userId, status);
    return Promise.all(stored.map((goal) => this.withProgress(userId, goal)));
  }

  async get(userId: string, goalId: GoalId): Promise<Goal> {
    const stored = await this.goals.findById(userId, goalId);
    if (stored === null) throw new EntityNotFoundError("Goal");
    return this.withProgress(userId, stored);
  }

  update(userId: string, goalId: GoalId, patch: UpdateGoal): Promise<Goal> {
    return withTxn(this.db, (tx) => this.updateInTx(userId, goalId, patch, tx));
  }

  async updateInTx(userId: string, goalId: GoalId, patch: UpdateGoal, tx: DbTx): Promise<Goal> {
    const before = await this.goals.findById(userId, goalId, tx);
    if (before === null) throw new EntityNotFoundError("Goal");

    const after = await this.goals.update(userId, goalId, patch, tx);
    if (after === null) throw new EntityNotFoundError("Goal");
    await this.audit.record(userId, "goal.update", goalId, tx, {
      before: {
        name: before.name,
        targetMinor: before.targetMinor,
        targetDate: before.targetDate
      },
      after: {
        name: after.name,
        targetMinor: after.targetMinor,
        targetDate: after.targetDate
      }
    });
    return this.withProgress(userId, after, tx);
  }

  async abandon(userId: string, goalId: GoalId): Promise<void> {
    await withTxn(this.db, (tx) => this.abandonInTx(userId, goalId, tx));
  }

  async abandonInTx(userId: string, goalId: GoalId, tx: DbTx): Promise<null> {
    if (!(await this.goals.abandon(userId, goalId, tx))) {
      throw new EntityNotFoundError("Goal");
    }
    await this.audit.record(userId, "goal.abandon", goalId, tx);
    return null;
  }

  async reorder(userId: string, input: ReorderGoals): Promise<void> {
    await withTxn(this.db, (tx) => this.reorderInTx(userId, input, tx));
  }

  async reorderInTx(userId: string, input: ReorderGoals, tx: DbTx): Promise<null> {
    await this.goals.lockOrdering(userId, tx);
    const active = await this.goals.list(userId, "active", tx);
    const activeIds = new Set(active.map((goal) => goal.id));
    if (
      activeIds.size !== input.goalIds.length ||
      input.goalIds.some((goalId) => !activeIds.has(goalId))
    ) {
      throw new InvalidGoalOrderError();
    }

    for (const [priority, goalId] of input.goalIds.entries()) {
      if (!(await this.goals.setPriority(userId, goalId, priority, tx))) {
        throw new EntityNotFoundError("Goal");
      }
    }
    await this.audit.record(userId, "goal.reorder", userId, tx, {
      goalIds: input.goalIds
    });
    return null;
  }

  recordContribution(userId: string, goalId: GoalId, input: CreateGoalContribution): Promise<Goal> {
    return withTxn(this.db, (tx) => this.recordContributionInTx(userId, goalId, input, tx));
  }

  async recordContributionInTx(
    userId: string,
    goalId: GoalId,
    input: CreateGoalContribution,
    tx: DbTx
  ): Promise<Goal> {
    const goal = await this.goals.findById(userId, goalId, tx);
    if (goal === null) throw new EntityNotFoundError("Goal");
    if (goal.status !== "active") {
      throw new Error("Cannot record contributions on inactive goals.");
    }
    if (goal.fundingMode !== "manual_envelope") {
      throw new Error("Contributions can only be recorded on manual envelope goals.");
    }

    const contribution = await this.goals.createContribution(userId, goalId, input, tx);
    await this.audit.record(userId, "goal.contribute", goalId, tx, {
      contributionId: contribution.id,
      type: contribution.type,
      amountMinor: contribution.amountMinor,
      occurredAt: contribution.occurredAt
    });

    return this.withProgress(userId, goal, tx);
  }

  async listContributions(userId: string, goalId: GoalId): Promise<GoalContribution[]> {
    const goal = await this.goals.findById(userId, goalId);
    if (goal === null) throw new EntityNotFoundError("Goal");
    return this.goals.listContributions(userId, goalId);
  }

  async getPlan(userId: string, goalId: GoalId, now: Date = new Date()): Promise<GoalPlan> {
    return calculateGoalPlan(await this.get(userId, goalId), now);
  }

  async getProgress(userId: string, goal: StoredGoal, tx?: DbTx): Promise<number> {
    if (goal.fundingMode === "manual_envelope") {
      return this.goals.sumManualContributions(userId, goal.id, tx);
    }

    if (goal.fundingMode === "tagged") {
      if (goal.tag === undefined) {
        throw new Error("Tagged goal is missing its tag.");
      }
      return this.goals.sumTaggedContributions(userId, goal.tag, tx);
    }

    if (goal.linkedAccountId === undefined) {
      throw new Error("Linked-account goal is missing its account.");
    }
    const account = await this.accounts.findById(userId, goal.linkedAccountId, tx);
    if (account === null) throw new EntityNotFoundError("Account");
    return account.balanceMinor - goal.startedMinor;
  }

  private async withProgress(userId: string, goal: StoredGoal, tx?: DbTx): Promise<Goal> {
    return GoalSchema.parse({
      ...goal,
      progressMinor: await this.getProgress(userId, goal, tx)
    });
  }
}
