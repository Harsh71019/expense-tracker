import { Injectable } from "@nestjs/common";
import { InjectConnection } from "@nestjs/mongoose";
import {
  computeFirstOccurrence,
  computeNextOccurrence,
  type CreateRecurringRule,
  type RecurringRule,
  type RecurringRuleId,
  type UpdateRecurringRule
} from "@vyaya/shared";
import type { Connection } from "mongoose";

import { AccountRepository } from "../accounts/account.repository.js";
import { CategoryRepository } from "../categories/category.repository.js";
import { EntityNotFoundError } from "../common/errors/entity-not-found.error.js";
import { InvalidRecurringRuleError } from "../common/errors/invalid-recurring-rule.error.js";
import { withTxn } from "../common/mongo-txn.js";
import { RecurringRuleRepository } from "./recurring-rule.repository.js";

@Injectable()
export class RecurringRuleService {
  constructor(
    @InjectConnection() private readonly connection: Connection,
    private readonly rules: RecurringRuleRepository,
    private readonly accounts: AccountRepository,
    private readonly categories: CategoryRepository
  ) {}

  /**
   * Not a money write (no balance change until the cron actually posts), but
   * wrapped in withTxn anyway so the account/category existence check and the
   * insert see one consistent snapshot rather than racing a concurrent
   * archive.
   */
  async create(userId: string, input: CreateRecurringRule): Promise<RecurringRule> {
    return withTxn(this.connection, async (session) => {
      if (!(await this.accounts.exists(userId, input.template.accountId, session))) {
        throw new EntityNotFoundError("Account");
      }
      // categories is already Postgres-backed (Task 10) while this transaction is still
      // Mongo -- out-of-transaction read, not participating in the transaction below;
      // resolved once this repository is itself ported to Postgres.
      if (
        input.template.categoryId !== undefined &&
        !(await this.categories.exists(userId, input.template.categoryId))
      ) {
        throw new EntityNotFoundError("Category");
      }

      const nextRunAt = computeFirstOccurrence(input.rrule, input.startAt);
      if (nextRunAt === null) throw new InvalidRecurringRuleError();

      return this.rules.create(userId, input, nextRunAt, session);
    });
  }

  list(userId: string): Promise<RecurringRule[]> {
    return this.rules.list(userId);
  }

  async update(
    userId: string,
    ruleId: RecurringRuleId,
    patch: UpdateRecurringRule
  ): Promise<RecurringRule> {
    return withTxn(this.connection, async (session) => {
      const current = await this.rules.findById(userId, ruleId, session);
      if (current === null) throw new EntityNotFoundError("Recurring rule");

      if (
        patch.template?.accountId !== undefined &&
        !(await this.accounts.exists(userId, patch.template.accountId, session))
      ) {
        throw new EntityNotFoundError("Account");
      }
      // out-of-transaction read against categories -- see the comment on the create() path above
      if (
        patch.template?.categoryId !== undefined &&
        !(await this.categories.exists(userId, patch.template.categoryId))
      ) {
        throw new EntityNotFoundError("Category");
      }

      let nextRunAt: Date | undefined;
      if (patch.rrule !== undefined) {
        const computed = computeNextOccurrence(patch.rrule, current.startAt, new Date());
        if (computed === null) throw new InvalidRecurringRuleError();
        nextRunAt = computed;
      }

      const updated = await this.rules.update(userId, ruleId, patch, nextRunAt, session);
      if (updated === null) throw new EntityNotFoundError("Recurring rule");
      return updated;
    });
  }
}
