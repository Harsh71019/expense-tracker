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
  "pending_parse",
  "parsing",
  "staged",
  "commit_queued",
  "committing",
  "committed",
  "revert_queued",
  "reverting",
  "reverted",
  "failed"
]);
export const importWorkflowOperationEnum = pgEnum("import_workflow_operation", [
  "parse",
  "commit",
  "revert"
]);
export const notificationTypeEnum = pgEnum("notification_type", [
  "budget_alert",
  "monthly_report",
  "balance_drift",
  "goal_achieved"
]);
export const notificationStatusEnum = pgEnum("notification_status", ["pending", "sent"]);
export const spendingWarningKindEnum = pgEnum("spending_warning_kind", [
  "overall_spend_spike",
  "category_spend_spike",
  "unusually_large_expense"
]);
export const spendingWarningSeverityEnum = pgEnum("spending_warning_severity", [
  "attention",
  "high"
]);
export const spendingWarningStatusEnum = pgEnum("spending_warning_status", [
  "active",
  "dismissed",
  "resolved"
]);
// Only the two states the worker can persist (plan §5); "stale"/"unavailable"
// are derived at API read time from `computedAt` and never stored.
export const spendingWarningAnalysisStateStatusEnum = pgEnum("spending_warning_analysis_status", [
  "learning",
  "ready"
]);
export const goalFundingModeEnum = pgEnum("goal_funding_mode", ["linked_account", "tagged"]);
export const goalStatusEnum = pgEnum("goal_status", ["active", "achieved", "abandoned"]);
