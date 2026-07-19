import { Inject, Injectable } from "@nestjs/common";
import type { Account, AccountId, CreateAccount } from "@vyaya/shared";

import { DATABASE_CONNECTION } from "../common/db/db.module.js";
import type { DrizzleDb } from "../common/db/db.module.js";
import { withTxn } from "../common/db/db-txn.js";
import { EntityNotFoundError } from "../common/errors/entity-not-found.error.js";
import { AccountRepository } from "./account.repository.js";

@Injectable()
export class AccountService {
  constructor(
    @Inject(DATABASE_CONNECTION) private readonly db: DrizzleDb,
    private readonly accounts: AccountRepository
  ) {}

  async create(userId: string, input: CreateAccount): Promise<Account> {
    return withTxn(this.db, async (tx) => this.accounts.create(userId, input, tx));
  }

  list(userId: string): Promise<Account[]> {
    return this.accounts.list(userId);
  }

  async archive(userId: string, accountId: AccountId): Promise<void> {
    if (!(await this.accounts.archive(userId, accountId))) throw new EntityNotFoundError("Account");
  }
}
