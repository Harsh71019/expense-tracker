import { Injectable } from "@nestjs/common";
import { AccountSchema, type Account, type AccountId, type CreateAccount } from "@vyaya/shared";
import { z } from "zod";

import { EntityNotFoundError } from "../common/errors/entity-not-found.error.js";
import {
  IdempotencyPostgresService,
  type IdempotentResult
} from "../common/idempotency/idempotency-postgres.service.js";
import { AccountRepository } from "./account.repository.js";

@Injectable()
export class AccountMutationService {
  constructor(
    private readonly accounts: AccountRepository,
    private readonly idempotency: IdempotencyPostgresService
  ) {}

  create(userId: string, input: CreateAccount, key: string): Promise<IdempotentResult<Account>> {
    return this.idempotency.execute(userId, "account.create", key, AccountSchema, (tx) =>
      this.accounts.create(userId, input, tx)
    );
  }

  archive(userId: string, accountId: AccountId, key: string): Promise<IdempotentResult<null>> {
    return this.idempotency.execute(userId, "account.archive", key, z.null(), async (tx) => {
      if (!(await this.accounts.archive(userId, accountId, tx)))
        throw new EntityNotFoundError("Account");
      return null;
    });
  }
}
