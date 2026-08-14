import {
  CreateAccountSchema,
  CreditCardConfigInputSchema,
  type AccountType,
  type CreateAccount,
  type CreditCardConfigInput
} from "@treasury-ops/shared";
import type { z } from "zod";

export function parseCreateAccountInput(fields: {
  name: string;
  type: AccountType;
  amountMinor: number;
  direction: "available" | "owed";
  statementDay: string;
  dueDay: string;
}): z.ZodSafeParseResult<CreateAccount> {
  return CreateAccountSchema.safeParse({
    name: fields.name,
    type: fields.type,
    openingBalanceMinor: fields.direction === "owed" ? -fields.amountMinor : fields.amountMinor,
    ...(fields.type === "credit_card"
      ? {
          creditCardConfig: {
            statementDay: Number(fields.statementDay),
            dueDay: Number(fields.dueDay)
          }
        }
      : {})
  });
}

export function parseCreditCardConfigInput(fields: {
  statementDay: string;
  dueDay: string;
}): z.ZodSafeParseResult<CreditCardConfigInput> {
  return CreditCardConfigInputSchema.safeParse({
    statementDay: Number(fields.statementDay),
    dueDay: Number(fields.dueDay)
  });
}
