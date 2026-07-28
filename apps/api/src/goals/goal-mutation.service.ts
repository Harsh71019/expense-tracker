import { Injectable } from "@nestjs/common";
import {
  GoalSchema,
  type CreateGoal,
  type Goal,
  type GoalId,
  type ReorderGoals,
  type UpdateGoal
} from "@treasury-ops/shared";
import { z } from "zod";

import {
  IdempotencyPostgresService,
  type IdempotentResult
} from "../common/idempotency/idempotency-postgres.service.js";
import { GoalService } from "./goal.service.js";

@Injectable()
export class GoalMutationService {
  constructor(
    private readonly goals: GoalService,
    private readonly idempotency: IdempotencyPostgresService
  ) {}

  create(userId: string, input: CreateGoal, key: string): Promise<IdempotentResult<Goal>> {
    return this.idempotency.execute(userId, "goal.create", key, input, GoalSchema, (tx) =>
      this.goals.createInTx(userId, input, tx)
    );
  }

  update(
    userId: string,
    goalId: GoalId,
    patch: UpdateGoal,
    key: string
  ): Promise<IdempotentResult<Goal>> {
    return this.idempotency.execute(
      userId,
      "goal.update",
      key,
      { goalId, patch },
      GoalSchema,
      (tx) => this.goals.updateInTx(userId, goalId, patch, tx)
    );
  }

  abandon(userId: string, goalId: GoalId, key: string): Promise<IdempotentResult<null>> {
    return this.idempotency.execute(userId, "goal.abandon", key, { goalId }, z.null(), (tx) =>
      this.goals.abandonInTx(userId, goalId, tx)
    );
  }

  reorder(userId: string, input: ReorderGoals, key: string): Promise<IdempotentResult<null>> {
    return this.idempotency.execute(userId, "goal.reorder", key, input, z.null(), (tx) =>
      this.goals.reorderInTx(userId, input, tx)
    );
  }
}
