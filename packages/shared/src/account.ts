import { z } from "zod";

import { CategoryColorSchema, CategoryIdSchema } from "./category.js";

const AccountBalanceMinorSchema = z
  .number()
  .int()
  .min(Number.MIN_SAFE_INTEGER)
  .max(Number.MAX_SAFE_INTEGER);

export const AccountTypeSchema = z.enum(["bank", "credit_card", "cash", "wallet", "investment"]);

export const AccountIdSchema = z.string().uuid("Account id must be a UUID.");

export const AccountInsightsRangeSchema = z.enum(["30d", "90d", "1y", "all"]);

export const AccountInsightsQuerySchema = z.object({
  range: AccountInsightsRangeSchema.default("30d")
});

export const AccountInsightsBucketSchema = z.enum(["day", "month"]);

const AccountInsightPeriodSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])-([0-2]\d|3[01])$/);

export const AccountBalancePointSchema = z.object({
  period: AccountInsightPeriodSchema,
  balanceMinor: AccountBalanceMinorSchema
});

export const AccountCashflowPointSchema = z.object({
  period: AccountInsightPeriodSchema,
  incomeMinor: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
  expenseMinor: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER)
});

export const AccountSpendingCategorySchema = z.object({
  categoryId: CategoryIdSchema.optional(),
  name: z.string().trim().min(1).max(80),
  color: CategoryColorSchema.optional(),
  amountMinor: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER),
  transactionCount: z.number().int().min(1)
});

export const AccountInsightsSchema = z.object({
  range: AccountInsightsRangeSchema,
  from: z.coerce.date(),
  to: z.coerce.date(),
  bucket: AccountInsightsBucketSchema,
  summary: z.object({
    incomeMinor: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
    expenseMinor: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
    netMinor: AccountBalanceMinorSchema,
    transactionCount: z.number().int().min(0)
  }),
  balanceSeries: z.array(AccountBalancePointSchema),
  cashflowSeries: z.array(AccountCashflowPointSchema),
  spendingByCategory: z.array(AccountSpendingCategorySchema)
});

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
export type AccountBalancePoint = z.infer<typeof AccountBalancePointSchema>;
export type AccountCashflowPoint = z.infer<typeof AccountCashflowPointSchema>;
export type AccountId = z.infer<typeof AccountIdSchema>;
export type AccountInsights = z.infer<typeof AccountInsightsSchema>;
export type AccountInsightsBucket = z.infer<typeof AccountInsightsBucketSchema>;
export type AccountInsightsQuery = z.infer<typeof AccountInsightsQuerySchema>;
export type AccountInsightsRange = z.infer<typeof AccountInsightsRangeSchema>;
export type AccountSpendingCategory = z.infer<typeof AccountSpendingCategorySchema>;
export type AccountType = z.infer<typeof AccountTypeSchema>;
export type CreateAccount = z.infer<typeof CreateAccountSchema>;
export type CreditCardConfig = z.infer<typeof CreditCardConfigSchema>;
export type CreditCardConfigInput = z.infer<typeof CreditCardConfigInputSchema>;
