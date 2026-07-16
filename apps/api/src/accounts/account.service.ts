import { Injectable } from "@nestjs/common";
import { InjectConnection } from "@nestjs/mongoose";
import type { Account, AccountId, CreateAccount } from "@vyaya/shared";
import type { Connection } from "mongoose";

import { EntityNotFoundError } from "../common/errors/entity-not-found.error.js";
import { withTxn } from "../common/mongo-txn.js";
import { AccountRepository } from "./account.repository.js";

@Injectable()
export class AccountService {
  constructor(
    @InjectConnection() private readonly connection: Connection,
    private readonly accounts: AccountRepository
  ) {}

  async create(userId: string, input: CreateAccount): Promise<Account> {
    return withTxn(this.connection, async (session) =>
      this.accounts.create(userId, input, session)
    );
  }

  list(userId: string): Promise<Account[]> {
    return this.accounts.list(userId);
  }

  async archive(userId: string, accountId: AccountId): Promise<void> {
    const archived = await this.accounts.archive(userId, accountId);
    if (!archived) {
      throw new EntityNotFoundError("Account");
    }
  }
}
