import { z } from "zod";

import { CategoryIdSchema } from "./category.js";
import { PageInfoSchema } from "./pagination.js";

const MinorAmountSchema = z.number().int().min(1).max(Number.MAX_SAFE_INTEGER);
const SignedMinorSchema = z
  .number()
  .int()
  .min(Number.MIN_SAFE_INTEGER)
  .max(Number.MAX_SAFE_INTEGER);
const NonNegativeMinorSchema = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);

export const BudgetIdSchema = z.string().uuid("Budget id must be a UUID.");

export const UpsertBudgetSchema = z.object({
  limitMinor: MinorAmountSchema
});

export const BudgetSchema = z.object({
  id: BudgetIdSchema,
  userId: z.string().min(1),
  categoryId: CategoryIdSchema,
  limitMinor: MinorAmountSchema,
  isArchived: z.boolean(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date()
});

export const BudgetProgressStateSchema = z.enum(["under", "approaching", "reached"]);

export const BudgetCategorySchema = z.object({
  id: CategoryIdSchema,
  name: z.string(),
  icon: z.string().nullable(),
  color: z.string().nullable(),
  isArchived: z.boolean()
});

export const BudgetProgressSchema = z.object({
  budget: BudgetSchema,
  category: BudgetCategorySchema,
  spentMinor: NonNegativeMinorSchema,
  remainingMinor: SignedMinorSchema,
  utilizationBps: z.number().int().min(0),
  state: BudgetProgressStateSchema,
  isEffective: z.boolean()
});

export const BudgetOverviewSchema = z.object({
  plannedMinor: NonNegativeMinorSchema,
  spentInBudgetedCategoriesMinor: NonNegativeMinorSchema,
  remainingMinor: SignedMinorSchema,
  unbudgetedSpentMinor: NonNegativeMinorSchema,
  activeBudgetCount: z.number().int().min(0)
});

export const BudgetAlertPolicySchema = z.object({
  thresholdsBps: z.array(z.number().int().min(1).max(10_000))
});

/**
 * `includeArchived` arrives as the string "true"/"false" (or is absent) over
 * the wire — `z.coerce.boolean()` would treat the literal string "false" as
 * truthy, so the query/absent/"true"/"false" cases are enumerated explicitly.
 */
export const ListBudgetsQuerySchema = z.object({
  cursor: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  includeArchived: z
    .union([z.literal("true"), z.literal("false")])
    .optional()
    .transform((value) => value === "true")
});

export const BudgetPageSchema = z.object({
  month: z.string().regex(/^\d{4}-\d{2}$/, "Month must be in YYYY-MM form."),
  computedAt: z.coerce.date(),
  alertPolicy: BudgetAlertPolicySchema,
  overview: BudgetOverviewSchema,
  items: z.array(BudgetProgressSchema),
  pageInfo: PageInfoSchema
});

export type BudgetId = z.infer<typeof BudgetIdSchema>;
export type UpsertBudget = z.infer<typeof UpsertBudgetSchema>;
export type Budget = z.infer<typeof BudgetSchema>;
export type BudgetProgressState = z.infer<typeof BudgetProgressStateSchema>;
export type BudgetCategory = z.infer<typeof BudgetCategorySchema>;
export type BudgetProgress = z.infer<typeof BudgetProgressSchema>;
export type BudgetOverview = z.infer<typeof BudgetOverviewSchema>;
export type BudgetAlertPolicy = z.infer<typeof BudgetAlertPolicySchema>;
export type ListBudgetsQuery = z.infer<typeof ListBudgetsQuerySchema>;
export type BudgetPage = z.infer<typeof BudgetPageSchema>;
