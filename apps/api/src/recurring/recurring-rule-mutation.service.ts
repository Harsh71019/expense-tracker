import { Injectable } from "@nestjs/common";
import {
  RecurringRuleSchema,
  type CreateRecurringRule,
  type RecurringRule,
  type RecurringRuleId,
  type UpdateRecurringRule
} from "@vyaya/shared";

import {
  IdempotencyPostgresService,
  type IdempotentResult
} from "../common/idempotency/idempotency-postgres.service.js";
import { RecurringRuleService } from "./recurring-rule.service.js";

@Injectable()
export class RecurringRuleMutationService {
  constructor(
    private readonly rules: RecurringRuleService,
    private readonly idempotency: IdempotencyPostgresService
  ) {}

  create(
    userId: string,
    input: CreateRecurringRule,
    key: string
  ): Promise<IdempotentResult<RecurringRule>> {
    return this.idempotency.execute(
      userId,
      "recurring-rule.create",
      key,
      RecurringRuleSchema,
      (tx) => this.rules.createInTxn(userId, input, tx)
    );
  }

  update(
    userId: string,
    ruleId: RecurringRuleId,
    patch: UpdateRecurringRule,
    key: string
  ): Promise<IdempotentResult<RecurringRule>> {
    return this.idempotency.execute(
      userId,
      "recurring-rule.update",
      key,
      RecurringRuleSchema,
      (tx) => this.rules.updateInTxn(userId, ruleId, patch, tx)
    );
  }
}
