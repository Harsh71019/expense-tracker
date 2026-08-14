import { CreateTransferSchema, type CreateTransfer } from "@treasury-ops/shared";
import type { z } from "zod";

export function parseCreateTransferInput(
  values: CreateTransfer
): z.ZodSafeParseResult<CreateTransfer> {
  return CreateTransferSchema.safeParse(values);
}

export function fieldErrorName(path: string): keyof CreateTransfer | null {
  if (
    path === "fromAccountId" ||
    path === "toAccountId" ||
    path === "amountMinor" ||
    path === "occurredAt" ||
    path === "description" ||
    path === "tags"
  ) {
    return path;
  }
  return null;
}
