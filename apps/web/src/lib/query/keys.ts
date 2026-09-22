import type {
  DashboardRange,
  DeclaredDebtStatus,
  GoalStatus,
  ListReceivablesQuery,
  ListTransactionsQuery
} from "@treasury-ops/shared";

import type { SpendingWarningFilters } from "@/features/spending-warnings/model/filters";

const transactionRoot = ["transactions"] as const;
const spendingWarningRoot = ["spending-warnings"] as const;
const goalRoot = ["goals"] as const;
const budgetRoot = ["budgets"] as const;
const dashboardRoot = ["dashboard"] as const;
const billRoot = ["bills"] as const;
const financialProfileRoot = ["financial-profile"] as const;
const financialSafetyRoot = ["financial-safety"] as const;
const receivableRoot = ["receivables"] as const;

export const qk = {
  transactions: () => transactionRoot,
  transactionLists: () => [...transactionRoot, "list"] as const,
  txns: (filters: ListTransactionsQuery) => [...transactionRoot, "list", filters] as const,
  transactionDetails: () => [...transactionRoot, "detail"] as const,
  txn: (transactionId: string) => [...transactionRoot, "detail", transactionId] as const,
  transactionInsights: () => [...transactionRoot, "insights"] as const,
  goals: () => goalRoot,
  goalList: (status: GoalStatus) => [...goalRoot, "list", status] as const,
  goal: (goalId: string) => [...goalRoot, "detail", goalId] as const,
  goalPlan: (goalId: string) => [...goalRoot, "plan", goalId] as const,
  goalContributions: (goalId: string) => [...goalRoot, "contributions", goalId] as const,
  budgets: () => budgetRoot,
  budgetLists: () => [...budgetRoot, "list"] as const,
  budgetList: (filters: Readonly<{ includeArchived: boolean; limit: number }>) =>
    [...budgetRoot, "list", filters] as const,
  accounts: () => ["accounts"] as const,
  bills: () => billRoot,
  billLists: () => [...billRoot, "list"] as const,
  billList: (filters: object) => [...billRoot, "list", filters] as const,
  billDetails: () => [...billRoot, "detail"] as const,
  billDetail: (billId: string) => [...billRoot, "detail", billId] as const,
  billStatementRows: (billId: string, filters: object) =>
    [...billRoot, "detail", billId, "statement-rows", filters] as const,
  categories: () => ["categories"] as const,
  categoryList: (includeArchived: boolean) => ["categories", "list", { includeArchived }] as const,
  categoryRecommendations: () => ["category-recommendations"] as const,
  categoryRecommendationQuery: (
    input: Readonly<{
      type: string;
      description: string;
      draft: string;
      occurredAt: string;
      limit: number;
    }>
  ) => ["category-recommendations", "query", input] as const,
  categoryRules: () => ["category-rules"] as const,
  recurringRules: () => ["recurring-rules"] as const,
  recurringStats: () => ["recurring-rules", "stats"] as const,
  recurringReconciliations: () => ["recurring-reconciliations"] as const,
  recurringOccurrences: (ruleId: string) => ["recurring-occurrences", ruleId] as const,
  recurringOccurrencesOutstanding: () => ["recurring-occurrences", "outstanding"] as const,
  pendingTransactions: () => ["pending-transactions"] as const,
  assets: () => ["assets"] as const,
  asset: (assetId: string) => ["assets", "detail", assetId] as const,
  assetValuations: (assetId: string) => ["asset-valuations", assetId] as const,
  assetFundings: (assetId: string) => ["asset-fundings", assetId] as const,
  marketRates: () => ["market-rates", "metals"] as const,
  netWorth: () => ["net-worth"] as const,
  receivables: () => receivableRoot,
  receivableSummary: () => [...receivableRoot, "summary"] as const,
  receivableList: (filters: ListReceivablesQuery) => [...receivableRoot, "list", filters] as const,
  receivable: (receivableId: string) => [...receivableRoot, "detail", receivableId] as const,
  receivableEvents: (receivableId: string) =>
    [...receivableRoot, "detail", receivableId, "events"] as const,
  receivableLinkCandidates: () => [...receivableRoot, "link-candidates"] as const,
  importBatches: () => ["import-batches"] as const,
  importPreview: (batchId: string) => ["import-preview", batchId] as const,
  importMapping: (accountId: string) => ["import-mapping", accountId] as const,
  monthlyRollups: () => ["monthly-rollup"] as const,
  monthlyRollup: (month: string) => ["monthly-rollup", month] as const,
  apiKeys: () => ["api-keys"] as const,
  spendingWarnings: () => spendingWarningRoot,
  spendingWarningLists: () => [...spendingWarningRoot, "list"] as const,
  spendingWarningList: (filters: SpendingWarningFilters) =>
    [...spendingWarningRoot, "list", filters] as const,
  profile: () => ["profile"] as const,
  financialProfile: () => financialProfileRoot,
  financialProfileState: () => [...financialProfileRoot, "state"] as const,
  financialDiagnostic: (asOf?: string) =>
    [...financialProfileRoot, "diagnostic", asOf ?? "latest"] as const,
  financialSafety: () => financialSafetyRoot,
  essentialBurn: (asOf?: string) =>
    [...financialSafetyRoot, "essential-burn", asOf ?? "latest"] as const,
  reserveSources: () => [...financialSafetyRoot, "reserve-sources"] as const,
  reserveSourceList: (
    filters: Readonly<{
      limit?: number;
      cursor?: string;
      sourceKind?: string;
      configured?: boolean;
      eligible?: boolean;
    }>
  ) => [...financialSafetyRoot, "reserve-sources", "list", filters] as const,
  reserveSummary: (asOf?: string) =>
    [...financialSafetyRoot, "reserves", asOf ?? "latest"] as const,
  safetyEvaluations: () => [...financialSafetyRoot, "evaluation"] as const,
  safetyEvaluation: (asOf?: string) =>
    [...financialSafetyRoot, "evaluation", asOf ?? "latest"] as const,
  salaryStatistics: () => [...financialProfileRoot, "salary-statistics"] as const,
  salaryVersions: (limit: number) =>
    [...financialProfileRoot, "salary-versions", { limit }] as const,
  protection: () => [...financialProfileRoot, "protection"] as const,
  declaredDebt: (debtId: string) => [...financialProfileRoot, "debts", "detail", debtId] as const,
  portfolioImportBatches: () => ["portfolio-import-batches"] as const,
  portfolioImportBatch: (batchId: string) => ["portfolio-import-batches", batchId] as const,
  portfolioImportRows: (batchId: string, filters?: { cursor?: string; limit?: number }) =>
    ["portfolio-import-rows", batchId, filters ?? {}] as const,
  assetMarketValuation: (assetId: string) => ["asset-market-valuation", assetId] as const,
  instrumentSearch: (type?: string, query?: string) =>
    ["instrument-search", type ?? "all", query ?? ""] as const,
  declaredDebts: () => [...financialProfileRoot, "debts"] as const,
  declaredDebtList: (filters: Readonly<{ status: DeclaredDebtStatus; limit: number }>) =>
    [...financialProfileRoot, "debts", "list", filters] as const,
  dashboard: () => dashboardRoot,
  recentActivity: (limit: number) => [...dashboardRoot, "recent-activity", limit] as const,
  dashboardStats: (period?: string) => [...dashboardRoot, "stats", period ?? "current"] as const,
  monthlySpending: () => [...dashboardRoot, "monthly-spending"] as const,
  cashflow: (range: DashboardRange) => [...dashboardRoot, "cashflow", range] as const,
  spendMix: (range: DashboardRange) => [...dashboardRoot, "spend-mix", range] as const,
  topSpending: (range: DashboardRange, limit: number) =>
    [...dashboardRoot, "top-spending", range, limit] as const,
  recurringForecast: (range: DashboardRange) =>
    [...dashboardRoot, "recurring-forecast", range] as const,
  investments: () => [...dashboardRoot, "investments"] as const
} as const;
