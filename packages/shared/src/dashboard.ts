import { z } from "zod";

import { AccountIdSchema } from "./account.js";
import { AssetIdSchema, AssetKindSchema } from "./asset.js";
import { CategoryIdSchema } from "./category.js";
import { MonthSchema } from "./report.js";
import { RecurringRuleIdSchema } from "./recurring.js";
import { TransactionIdSchema, TransactionTypeSchema } from "./transaction.js";

export const DashboardRangeSchema = z.enum(["1W", "1M", "6M", "12M"]);

export const DashboardSummarySchema = z.object({
  totalBalanceMinor: z.number().int(),
  activeAccountCount: z.number().int().min(0),
  assetsMinor: z.number().int().min(0),
  liabilitiesMinor: z.number().int().min(0)
});

export const RecentActivityQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(10)
});

export const RecentActivityItemSchema = z.object({
  id: TransactionIdSchema,
  accountId: AccountIdSchema,
  accountName: z.string(),
  categoryId: CategoryIdSchema.optional(),
  type: TransactionTypeSchema,
  amountMinor: z.number().int().positive(),
  description: z.string(),
  occurredAt: z.coerce.date(),
  tags: z.array(z.string())
});

export const DashboardStatsQuerySchema = z.object({
  period: MonthSchema.optional()
});

const MoneyStatSchema = z.object({
  valueMinor: z.number().int(),
  deltaPct: z.number().nullable(),
  trend: z.array(z.number().int())
});

const PercentStatSchema = z.object({
  valuePct: z.number(),
  deltaPct: z.number().nullable(),
  trend: z.array(z.number())
});

export const DashboardStatsSchema = z.object({
  period: MonthSchema,
  spent: MoneyStatSchema,
  income: MoneyStatSchema,
  savingsRate: PercentStatSchema,
  netWorth: MoneyStatSchema
});

export const CashflowQuerySchema = z.object({ range: DashboardRangeSchema });

export const CashflowBucketSchema = z.object({
  label: z.string(),
  incomeMinor: z.number().int().min(0),
  expenseMinor: z.number().int().min(0)
});

export const CashflowResponseSchema = z.object({
  range: DashboardRangeSchema,
  buckets: z.array(CashflowBucketSchema)
});

export const TopSpendingQuerySchema = z.object({
  range: DashboardRangeSchema,
  limit: z.coerce.number().int().min(1).max(20).default(5)
});

export const TopSpendingItemSchema = z.object({
  categoryId: CategoryIdSchema.optional(),
  name: z.string(),
  icon: z.string().optional(),
  color: z.string().optional(),
  amountMinor: z.number().int().min(0),
  txnCount: z.number().int().min(0)
});

export const SpendMixQuerySchema = z.object({ range: DashboardRangeSchema });

const SpendMixBucketSchema = z.object({
  amountMinor: z.number().int().min(0),
  pct: z.number().min(0).max(100)
});

export const SpendMixSchema = z.object({
  range: DashboardRangeSchema,
  totalMinor: z.number().int().min(0),
  essential: SpendMixBucketSchema,
  lifestyle: SpendMixBucketSchema,
  uncategorized: SpendMixBucketSchema
});

export const DashboardInvestmentItemSchema = z.object({
  assetId: AssetIdSchema,
  name: z.string(),
  kind: AssetKindSchema,
  currentValueMinor: z.number().int(),
  returnPct: z.number().nullable(),
  series: z.array(z.object({ valuedAt: z.coerce.date(), valueMinor: z.number().int() }))
});

export const DashboardInvestmentsSchema = z.object({
  items: z.array(DashboardInvestmentItemSchema)
});

export const RecurringForecastQuerySchema = z.object({ range: DashboardRangeSchema });

export const RecurringForecastUpcomingItemSchema = z.object({
  ruleId: RecurringRuleIdSchema,
  name: z.string(),
  icon: z.string().optional(),
  type: TransactionTypeSchema,
  amountMinor: z.number().int().positive(),
  nextRunAt: z.coerce.date()
});

export const RecurringForecastSchema = z.object({
  range: DashboardRangeSchema,
  inMinor: z.number().int().min(0),
  outMinor: z.number().int().min(0),
  netMinor: z.number().int(),
  upcoming: z.array(RecurringForecastUpcomingItemSchema)
});

export type DashboardRange = z.infer<typeof DashboardRangeSchema>;
export type DashboardSummary = z.infer<typeof DashboardSummarySchema>;
export type RecentActivityQuery = z.infer<typeof RecentActivityQuerySchema>;
export type RecentActivityItem = z.infer<typeof RecentActivityItemSchema>;
export type DashboardStatsQuery = z.infer<typeof DashboardStatsQuerySchema>;
export type DashboardStats = z.infer<typeof DashboardStatsSchema>;
export type CashflowQuery = z.infer<typeof CashflowQuerySchema>;
export type CashflowBucket = z.infer<typeof CashflowBucketSchema>;
export type CashflowResponse = z.infer<typeof CashflowResponseSchema>;
export type TopSpendingQuery = z.infer<typeof TopSpendingQuerySchema>;
export type TopSpendingItem = z.infer<typeof TopSpendingItemSchema>;
export type SpendMixQuery = z.infer<typeof SpendMixQuerySchema>;
export type SpendMix = z.infer<typeof SpendMixSchema>;
export type DashboardInvestmentItem = z.infer<typeof DashboardInvestmentItemSchema>;
export type DashboardInvestments = z.infer<typeof DashboardInvestmentsSchema>;
export type RecurringForecastQuery = z.infer<typeof RecurringForecastQuerySchema>;
export type RecurringForecastUpcomingItem = z.infer<typeof RecurringForecastUpcomingItemSchema>;
export type RecurringForecast = z.infer<typeof RecurringForecastSchema>;
