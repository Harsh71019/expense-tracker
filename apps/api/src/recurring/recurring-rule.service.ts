import { Inject, Injectable } from "@nestjs/common";
import {
  computeFirstOccurrence,
  computeNextOccurrence,
  type CreateRecurringRule,
  type RecurringRule,
  type RecurringRuleId,
  type UpdateRecurringRule
} from "@treasury-ops/shared";

import { AccountRepository } from "../accounts/account.repository.js";
import { CategoryRepository } from "../categories/category.repository.js";
import { DATABASE_CONNECTION } from "../common/db/db.module.js";
import type { DrizzleDb } from "../common/db/db.module.js";
import { withTxn } from "../common/db/db-txn.js";
import type { DbTx } from "../common/db/db-txn.js";
import { EntityNotFoundError } from "../common/errors/entity-not-found.error.js";
import { InvalidRecurringRuleError } from "../common/errors/invalid-recurring-rule.error.js";
import { RecurringRuleRepository } from "./recurring-rule.repository.js";

@Injectable()
export class RecurringRuleService {
  constructor(
    @Inject(DATABASE_CONNECTION) private readonly db: DrizzleDb,
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
    return withTxn(this.db, (tx) => this.createInTxn(userId, input, tx));
  }

  async createInTxn(userId: string, input: CreateRecurringRule, tx: DbTx): Promise<RecurringRule> {
    if (!(await this.accounts.exists(userId, input.template.accountId, tx))) {
      throw new EntityNotFoundError("Account");
    }
    if (
      input.template.categoryId !== undefined &&
      !(await this.categories.exists(userId, input.template.categoryId, tx))
    ) {
      throw new EntityNotFoundError("Category");
    }

    const nextRunAt = computeFirstOccurrence(input.rrule, input.startAt);
    if (nextRunAt === null) throw new InvalidRecurringRuleError();

    return this.rules.create(userId, input, nextRunAt, tx);
  }

  list(userId: string): Promise<RecurringRule[]> {
    return this.rules.list(userId);
  }

  async update(
    userId: string,
    ruleId: RecurringRuleId,
    patch: UpdateRecurringRule
  ): Promise<RecurringRule> {
    return withTxn(this.db, (tx) => this.updateInTxn(userId, ruleId, patch, tx));
  }

  async updateInTxn(
    userId: string,
    ruleId: RecurringRuleId,
    patch: UpdateRecurringRule,
    tx: DbTx
  ): Promise<RecurringRule> {
    const current = await this.rules.findById(userId, ruleId, tx);
    if (current === null) throw new EntityNotFoundError("Recurring rule");

    if (
      patch.template?.accountId !== undefined &&
      !(await this.accounts.exists(userId, patch.template.accountId, tx))
    ) {
      throw new EntityNotFoundError("Account");
    }
    if (
      patch.template?.categoryId !== undefined &&
      !(await this.categories.exists(userId, patch.template.categoryId, tx))
    ) {
      throw new EntityNotFoundError("Category");
    }

    let nextRunAt: Date | undefined;
    if (patch.rrule !== undefined) {
      const computed = computeNextOccurrence(patch.rrule, current.startAt, new Date());
      if (computed === null) throw new InvalidRecurringRuleError();
      nextRunAt = computed;
    }

    const updated = await this.rules.update(userId, ruleId, patch, nextRunAt, tx);
    if (updated === null) throw new EntityNotFoundError("Recurring rule");
    return updated;
  }
}
