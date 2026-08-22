import { Inject, Injectable } from "@nestjs/common";
import {
  computeNextCreditCardStatementAt,
  type Account,
  type AccountId,
  type AccountInsights,
  type AccountInsightsRange,
  type CreateAccount
} from "@treasury-ops/shared";

import { DATABASE_CONNECTION } from "../common/db/db.module.js";
import type { DrizzleDb } from "../common/db/db.module.js";
import { withTxn } from "../common/db/db-txn.js";
import { EntityNotFoundError } from "../common/errors/entity-not-found.error.js";
import { AccountInsightsRepository } from "./account-insights.repository.js";
import { buildAccountInsightsWindow } from "./account-insights-window.js";
import { AccountRepository } from "./account.repository.js";

@Injectable()
export class AccountService {
  constructor(
    @Inject(DATABASE_CONNECTION) private readonly db: DrizzleDb,
    private readonly accounts: AccountRepository,
    private readonly accountInsights: AccountInsightsRepository
  ) {}

  async create(userId: string, input: CreateAccount): Promise<Account> {
    const nextStatementAt =
      input.creditCardConfig === undefined
        ? undefined
        : computeNextCreditCardStatementAt(input.creditCardConfig.statementDay, new Date());
    return withTxn(this.db, async (tx) => this.accounts.create(userId, input, tx, nextStatementAt));
  }

  list(userId: string): Promise<Account[]> {
    return this.accounts.list(userId);
  }

  async get(userId: string, accountId: AccountId): Promise<Account> {
    const account = await this.accounts.findById(userId, accountId);
    if (account === null) throw new EntityNotFoundError("Account");
    return account;
  }

  async getInsights(
    userId: string,
    accountId: AccountId,
    range: AccountInsightsRange
  ): Promise<AccountInsights> {
    const account = await this.get(userId, accountId);
    return this.accountInsights.get(
      userId,
      account,
      buildAccountInsightsWindow(range, account.createdAt)
    );
  }

  async archive(userId: string, accountId: AccountId): Promise<void> {
    if (!(await this.accounts.archive(userId, accountId))) throw new EntityNotFoundError("Account");
  }
}
