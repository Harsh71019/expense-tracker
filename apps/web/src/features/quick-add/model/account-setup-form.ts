import {
  AccountTypeSchema,
  CreateAccountSchema,
  type AccountType,
  type CreateAccount
} from "@treasury-ops/shared";
import type { z } from "zod";

export function parseAccountSetupInput(fields: {
  name: string;
  type: AccountType;
}): z.ZodSafeParseResult<CreateAccount> {
  return CreateAccountSchema.safeParse({ ...fields, openingBalanceMinor: 0 });
}

export function parseAccountType(value: string): z.ZodSafeParseResult<AccountType> {
  return AccountTypeSchema.safeParse(value);
}
