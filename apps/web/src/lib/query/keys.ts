import type { DashboardRange, GoalStatus, ListTransactionsQuery } from "@treasury-ops/shared";

const transactionRoot = ["transactions"] as const;
const goalRoot = ["goals"] as const;
const budgetRoot = ["budgets"] as const;
const dashboardRoot = ["dashboard"] as const;

export const qk = {
  transactions: () => transactionRoot,
  transactionLists: () => [...transactionRoot, "list"] as const,
  txns: (filters: ListTransactionsQuery) => [...transactionRoot, "list", filters] as const,
  transactionDetails: () => [...transactionRoot, "detail"] as const,
  txn: (transactionId: string) => [...transactionRoot, "detail", transactionId] as const,
  goals: () => goalRoot,
  goalList: (status: GoalStatus) => [...goalRoot, "list", status] as const,
  goal: (goalId: string) => [...goalRoot, "detail", goalId] as const,
  goalPlan: (goalId: string) => [...goalRoot, "plan", goalId] as const,
  budgets: () => budgetRoot,
  budgetLists: () => [...budgetRoot, "list"] as const,
  budgetList: (filters: Readonly<{ includeArchived: boolean; limit: number }>) =>
    [...budgetRoot, "list", filters] as const,
  accounts: () => ["accounts"] as const,
  categories: () => ["categories"] as const,
  categoryRules: () => ["category-rules"] as const,
  recurringRules: () => ["recurring-rules"] as const,
  assets: () => ["assets"] as const,
  assetValuations: (assetId: string) => ["asset-valuations", assetId] as const,
  netWorth: () => ["net-worth"] as const,
  importBatches: () => ["import-batches"] as const,
  importPreview: (batchId: string) => ["import-preview", batchId] as const,
  importMapping: (accountId: string) => ["import-mapping", accountId] as const,
  monthlyRollup: (month: string) => ["monthly-rollup", month] as const,
  apiKeys: () => ["api-keys"] as const,
  profile: () => ["profile"] as const,
  dashboard: () => dashboardRoot,
  recentActivity: (limit: number) => [...dashboardRoot, "recent-activity", limit] as const,
  dashboardStats: (period?: string) => [...dashboardRoot, "stats", period ?? "current"] as const,
  cashflow: (range: DashboardRange) => [...dashboardRoot, "cashflow", range] as const,
  spendMix: (range: DashboardRange) => [...dashboardRoot, "spend-mix", range] as const,
  topSpending: (range: DashboardRange, limit: number) =>
    [...dashboardRoot, "top-spending", range, limit] as const,
  recurringForecast: (range: DashboardRange) =>
    [...dashboardRoot, "recurring-forecast", range] as const,
  investments: () => [...dashboardRoot, "investments"] as const
} as const;
