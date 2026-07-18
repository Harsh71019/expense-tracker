import { z } from "zod";

const AccountBalanceMinorSchema = z
  .number()
  .int()
  .min(Number.MIN_SAFE_INTEGER)
  .max(Number.MAX_SAFE_INTEGER);

export const AccountTypeSchema = z.enum(["bank", "credit_card", "cash", "wallet", "investment"]);

export const AccountIdSchema = z.string().uuid("Account id must be a UUID.");

export const CreateAccountSchema = z.object({
  name: z.string().trim().min(1).max(80),
  type: AccountTypeSchema,
  openingBalanceMinor: AccountBalanceMinorSchema
});

export const AccountSchema = CreateAccountSchema.extend({
  id: AccountIdSchema,
  userId: z.string().min(1),
  currency: z.literal("INR"),
  balanceMinor: AccountBalanceMinorSchema,
  isArchived: z.boolean(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date()
});

export type Account = z.infer<typeof AccountSchema>;
export type AccountId = z.infer<typeof AccountIdSchema>;
export type AccountType = z.infer<typeof AccountTypeSchema>;
export type CreateAccount = z.infer<typeof CreateAccountSchema>;
