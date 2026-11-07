import { z } from "zod";

import { AccountIdSchema } from "./account.js";
import { CategoryIdSchema } from "./category.js";
import { CategoryRollupNodeSchema } from "./category-tree.js";

export const MONTHLY_ROLLUP_FORMULA_VERSION = 2;

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
  totalCashOutflowMinor: z.number().int().min(0),
  totalConsumptionMinor: z.number().int().min(0),
  totalAssetFundingMinor: z.number().int().min(0),
  consumptionByCategory: z.array(CategoryRollupSchema),
  formulaVersion: z.number().int().min(1),
  computedAt: z.coerce.date()
});

/**
 * The API response for a month. `byCategory`/`consumptionByCategory` stay the
 * stored per-category direct amounts; `consumptionTree` is derived from them
 * with the user's current hierarchy on every read, so it is never cached and
 * moving a category needs no rollup recompute.
 */
export const MonthlyReportSchema = MonthlyRollupSchema.extend({
  consumptionTree: z.array(CategoryRollupNodeSchema)
});

export type Month = z.infer<typeof MonthSchema>;
export type CategoryRollup = z.infer<typeof CategoryRollupSchema>;
export type AccountRollup = z.infer<typeof AccountRollupSchema>;
export type MonthlyRollup = z.infer<typeof MonthlyRollupSchema>;
export type MonthlyReport = z.infer<typeof MonthlyReportSchema>;
