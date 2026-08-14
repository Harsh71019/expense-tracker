import { CreateTransactionSchema, type CreateTransaction } from "@treasury-ops/shared";
import type { z } from "zod";

export function parseCreateTransactionInput(
  values: CreateTransaction
): z.ZodSafeParseResult<CreateTransaction> {
  return CreateTransactionSchema.safeParse(values);
}

export function fieldErrorName(path: string): keyof CreateTransaction | null {
  if (
    path === "accountId" ||
    path === "categoryId" ||
    path === "type" ||
    path === "amountMinor" ||
    path === "occurredAt" ||
    path === "description" ||
    path === "tags"
  ) {
    return path;
  }
  return null;
}
