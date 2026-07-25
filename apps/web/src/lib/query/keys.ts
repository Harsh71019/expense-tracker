import type { GoalStatus, ListTransactionsQuery } from "@treasury-ops/shared";

const transactionRoot = ["transactions"] as const;
const goalRoot = ["goals"] as const;

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
  apiKeys: () => ["api-keys"] as const
} as const;
