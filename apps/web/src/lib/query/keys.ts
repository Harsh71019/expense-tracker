import type { ListTransactionsQuery } from "@vyaya/shared";

export const qk = {
  txns: (filters: ListTransactionsQuery) => ["txns", filters] as const,
  txn: (transactionId: string) => ["txn", transactionId] as const,
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
  monthlyRollup: (month: string) => ["monthly-rollup", month] as const
} as const;
