import { Injectable } from "@nestjs/common";
import {
  BudgetSchema,
  type Budget,
  type BudgetId,
  type CategoryId,
  type UpsertBudget
} from "@treasury-ops/shared";
import {
  IdempotencyPostgresService,
  type IdempotentResult
} from "../common/idempotency/idempotency-postgres.service.js";
import { BudgetService } from "./budget.service.js";

@Injectable()
export class BudgetMutationService {
  constructor(
    private readonly budgets: BudgetService,
    private readonly idempotency: IdempotencyPostgresService
  ) {}

  upsert(
    userId: string,
    categoryId: CategoryId,
    input: UpsertBudget,
    key: string
  ): Promise<IdempotentResult<Budget>> {
    return this.idempotency.execute(userId, "budget.upsert", key, BudgetSchema, (tx) =>
      this.budgets.upsertInTx(userId, categoryId, input, tx)
    );
  }

  archive(userId: string, budgetId: BudgetId, key: string): Promise<IdempotentResult<Budget>> {
    return this.idempotency.execute(userId, "budget.archive", key, BudgetSchema, (tx) =>
      this.budgets.archiveInTx(userId, budgetId, tx)
    );
  }
}
