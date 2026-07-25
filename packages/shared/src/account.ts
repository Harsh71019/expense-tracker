import { z } from "zod";

const AccountBalanceMinorSchema = z
  .number()
  .int()
  .min(Number.MIN_SAFE_INTEGER)
  .max(Number.MAX_SAFE_INTEGER);

export const AccountTypeSchema = z.enum(["bank", "credit_card", "cash", "wallet", "investment"]);

export const AccountIdSchema = z.string().uuid("Account id must be a UUID.");

export const CreditCardConfigInputSchema = z.object({
  statementDay: z.number().int().min(1).max(31),
  dueDay: z.number().int().min(1).max(31)
});

export const CreditCardConfigSchema = CreditCardConfigInputSchema.extend({
  nextStatementAt: z.coerce.date()
});

const CreateAccountBaseSchema = z.object({
  name: z.string().trim().min(1).max(80),
  type: AccountTypeSchema,
  openingBalanceMinor: AccountBalanceMinorSchema,
  creditCardConfig: CreditCardConfigInputSchema.optional()
});

export const CreateAccountSchema = CreateAccountBaseSchema.superRefine((value, context) => {
  if (value.type !== "credit_card" && value.creditCardConfig !== undefined) {
    context.addIssue({
      code: "custom",
      path: ["creditCardConfig"],
      message: "Credit card configuration is only valid for credit-card accounts."
    });
  }
});

export const AccountSchema = CreateAccountBaseSchema.omit({ creditCardConfig: true })
  .extend({
    id: AccountIdSchema,
    userId: z.string().min(1),
    currency: z.literal("INR"),
    balanceMinor: AccountBalanceMinorSchema,
    creditCardConfig: CreditCardConfigSchema.optional(),
    isArchived: z.boolean(),
    createdAt: z.coerce.date(),
    updatedAt: z.coerce.date()
  })
  .superRefine((value, context) => {
    if (value.type !== "credit_card" && value.creditCardConfig !== undefined) {
      context.addIssue({
        code: "custom",
        path: ["creditCardConfig"],
        message: "Credit card configuration is only valid for credit-card accounts."
      });
    }
  });

export type Account = z.infer<typeof AccountSchema>;
export type AccountId = z.infer<typeof AccountIdSchema>;
export type AccountType = z.infer<typeof AccountTypeSchema>;
export type CreateAccount = z.infer<typeof CreateAccountSchema>;
export type CreditCardConfig = z.infer<typeof CreditCardConfigSchema>;
export type CreditCardConfigInput = z.infer<typeof CreditCardConfigInputSchema>;
