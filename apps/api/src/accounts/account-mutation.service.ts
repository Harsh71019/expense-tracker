import { Injectable } from "@nestjs/common";
import { InjectConnection } from "@nestjs/mongoose";
import { AccountSchema, type Account, type AccountId, type CreateAccount } from "@vyaya/shared";
import type { Connection } from "mongoose";
import { z } from "zod";

import { EntityNotFoundError } from "../common/errors/entity-not-found.error.js";
import {
  IdempotencyService,
  type IdempotentResult
} from "../common/idempotency/idempotency.service.js";
import { AccountRepository } from "./account.repository.js";

@Injectable()
export class AccountMutationService {
  constructor(
    @InjectConnection() private readonly connection: Connection,
    private readonly accounts: AccountRepository,
    private readonly idempotency: IdempotencyService
  ) {}

  create(userId: string, input: CreateAccount, key: string): Promise<IdempotentResult<Account>> {
    return this.idempotency.execute(
      this.connection,
      userId,
      "account.create",
      key,
      AccountSchema,
      (session) => this.accounts.create(userId, input, session)
    );
  }

  archive(userId: string, accountId: AccountId, key: string): Promise<IdempotentResult<null>> {
    return this.idempotency.execute(
      this.connection,
      userId,
      "account.archive",
      key,
      z.null(),
      async (session) => {
        if (!(await this.accounts.archive(userId, accountId, session)))
          throw new EntityNotFoundError("Account");
        return null;
      }
    );
  }
}
