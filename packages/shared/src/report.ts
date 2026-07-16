import { z } from "zod";

import { AccountIdSchema } from "./account.js";
import { CategoryIdSchema } from "./category.js";

export const MonthSchema = z
  .string()
  .regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Month must be in YYYY-MM format.");

export const CategoryRollupSchema = z.object({
  categoryId: CategoryIdSchema.optional(),
  spentMinor: z.number().int().min(0),
  incomeMinor: z.number().int().min(0),
  txnCount: z.number().int().min(0)
});

export const AccountRollupSchema = z.object({
  accountId: AccountIdSchema,
  netMinor: z.number().int()
});

export const MonthlyRollupSchema = z.object({
  userId: z.string().min(1),
  month: MonthSchema,
  byCategory: z.array(CategoryRollupSchema),
  byAccount: z.array(AccountRollupSchema),
  totalExpenseMinor: z.number().int().min(0),
  totalIncomeMinor: z.number().int().min(0),
  computedAt: z.coerce.date()
});

export type Month = z.infer<typeof MonthSchema>;
export type CategoryRollup = z.infer<typeof CategoryRollupSchema>;
export type AccountRollup = z.infer<typeof AccountRollupSchema>;
export type MonthlyRollup = z.infer<typeof MonthlyRollupSchema>;
