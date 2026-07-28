import { Injectable } from "@nestjs/common";
import {
  AccountSchema,
  computeNextCreditCardStatementAt,
  type Account,
  type AccountId,
  type CreateAccount
} from "@treasury-ops/shared";
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
    const nextStatementAt =
      input.creditCardConfig === undefined
        ? undefined
        : computeNextCreditCardStatementAt(input.creditCardConfig.statementDay, new Date());
    return this.idempotency.execute(userId, "account.create", key, input, AccountSchema, (tx) =>
      this.accounts.create(userId, input, tx, nextStatementAt)
    );
  }

  archive(userId: string, accountId: AccountId, key: string): Promise<IdempotentResult<null>> {
    return this.idempotency.execute(
      userId,
      "account.archive",
      key,
      { accountId },
      z.null(),
      async (tx) => {
        if (!(await this.accounts.archive(userId, accountId, tx)))
          throw new EntityNotFoundError("Account");
        return null;
      }
    );
  }
}
