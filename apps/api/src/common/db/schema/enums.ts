import { pgEnum } from "drizzle-orm/pg-core";

export const accountTypeEnum = pgEnum("account_type", [
  "bank",
  "credit_card",
  "cash",
  "wallet",
  "investment"
]);
export const categoryKindEnum = pgEnum("category_kind", ["expense", "income"]);
export const categoryGroupEnum = pgEnum("category_group", ["essential", "lifestyle"]);
export const transactionTypeEnum = pgEnum("transaction_type", ["expense", "income"]);
export const transactionStatusEnum = pgEnum("transaction_status", [
  "posted",
  "reversed",
  "reversal"
]);
export const transactionSourceEnum = pgEnum("transaction_source", [
  "manual",
  "csv_import",
  "recurring",
  "api"
]);
export const assetKindEnum = pgEnum("asset_kind", [
  "loan_receivable",
  "loan_liability",
  "fixed_deposit",
  "gold",
  "silver",
  "investment"
]);
export const valuationSourceEnum = pgEnum("valuation_source", ["manual", "maturity_projection"]);
export const importBatchStatusEnum = pgEnum("import_batch_status", [
  "pending",
  "staged",
  "committed",
  "reverted",
  "failed"
]);
export const notificationTypeEnum = pgEnum("notification_type", [
  "budget_alert",
  "monthly_report",
  "balance_drift",
  "goal_achieved"
]);
export const notificationStatusEnum = pgEnum("notification_status", ["pending", "sent"]);
export const billReconciliationStatusEnum = pgEnum("bill_reconciliation_status", [
  "awaiting_statement",
  "reconciled"
]);
export const billStatementUploadStatusEnum = pgEnum("bill_statement_upload_status", [
  "pending",
  "staged",
  "failed"
]);
export const billStatementRowMatchStatusEnum = pgEnum("bill_statement_row_match_status", [
  "matched",
  "missing_from_ledger",
  "ambiguous"
]);
export const goalFundingModeEnum = pgEnum("goal_funding_mode", ["linked_account", "tagged"]);
export const goalStatusEnum = pgEnum("goal_status", ["active", "achieved", "abandoned"]);
