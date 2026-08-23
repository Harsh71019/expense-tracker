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
// Internal classification only: never accepted from a public transaction-write
// request body. `receivable_principal` marks a transaction posted by the
// receivables ledger (lend/repay) so reporting can exclude balance-sheet
// movement from income/spend analytics while account balance reconstruction
// keeps including it.
export const transactionPurposeEnum = pgEnum("transaction_purpose", [
  "ordinary",
  "receivable_principal"
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
export const marketInstrumentTypeEnum = pgEnum("market_instrument_type", [
  "mutual_fund",
  "gold_etf",
  "silver_etf",
  "gold_fund",
  "silver_fund",
  "sgb",
  "physical_gold",
  "physical_silver"
]);
export const marketDataProviderEnum = pgEnum("market_data_provider", [
  "amfi",
  "ibja",
  "goldapi",
  "metalpriceapi",
  "manual"
]);
export const fundSchemePlanEnum = pgEnum("fund_scheme_plan", ["direct", "regular", "unknown"]);
export const fundSchemeOptionEnum = pgEnum("fund_scheme_option", ["growth", "idcw", "unknown"]);
export const sgbAcquisitionChannelEnum = pgEnum("sgb_acquisition_channel", [
  "original_issue",
  "secondary_market",
  "unknown"
]);
export const marketQuoteUnitEnum = pgEnum("market_quote_unit", ["fund_unit", "gram"]);
export const assetPositionEventTypeEnum = pgEnum("asset_position_event_type", [
  "opening",
  "purchase",
  "reinvestment",
  "switch_in",
  "redemption",
  "switch_out",
  "reconciliation_in",
  "reconciliation_out",
  "reversal"
]);
export const assetPositionEventSourceEnum = pgEnum("asset_position_event_source", [
  "manual",
  "cas",
  "broker_import",
  "legacy_backfill"
]);
export const assetFundingStatusEnum = pgEnum("asset_funding_status", [
  "posted",
  "reversed",
  "reversal"
]);
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
  "goal_achieved",
  "recurring_reconciliation_pending"
]);
export const notificationStatusEnum = pgEnum("notification_status", [
  "pending",
  "delivering",
  "sent"
]);
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
export const scheduledRunStatusEnum = pgEnum("scheduled_run_status", [
  "running",
  "completed",
  "failed"
]);
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
export const goalFundingModeEnum = pgEnum("goal_funding_mode", [
  "linked_account",
  "tagged",
  "manual_envelope"
]);
export const goalStatusEnum = pgEnum("goal_status", ["active", "achieved", "abandoned"]);
export const goalContributionTypeEnum = pgEnum("goal_contribution_type", ["deposit", "withdrawal"]);
export const recurringReconciliationStatusEnum = pgEnum("recurring_reconciliation_status", [
  "auto_matched",
  "ambiguous",
  "amount_mismatch"
]);
export const recurringReconciliationResolutionEnum = pgEnum("recurring_reconciliation_resolution", [
  "confirmed_duplicate",
  "confirmed_distinct"
]);
export const recurringOccurrenceStatusEnum = pgEnum("recurring_occurrence_status", [
  "expected",
  "confirmed"
]);
export const pendingTransactionStatusEnum = pgEnum("pending_transaction_status", [
  "pending",
  "confirmed",
  "dismissed"
]);
export const detectedStreamCadenceEnum = pgEnum("detected_stream_cadence", [
  "weekly",
  "biweekly",
  "semimonthly",
  "monthly",
  "quarterly",
  "annual"
]);
export const detectedStreamStateEnum = pgEnum("detected_stream_state", [
  "candidate",
  "mature",
  "stale"
]);
export const detectedStreamAmountBehaviorEnum = pgEnum("detected_stream_amount_behavior", [
  "fixed",
  "variable",
  "unknown"
]);
export const incomeStabilityEnum = pgEnum("income_stability", ["stable", "variable", "irregular"]);
// Only manual entry exists today; salary detection sources arrive with later
// features and will extend this enum additively.
export const salarySourceEnum = pgEnum("salary_source", ["manually_confirmed"]);
// Employer-provided cover stays a distinct value from independently held
// cover: employer cover usually ends with the employment, so the two can never
// collapse into one "covered" state.
export const termCoverStatusEnum = pgEnum("term_cover_status", [
  "independent",
  "employer_only",
  "both",
  "none",
  "not_sure",
  "not_applicable"
]);
export const healthCoverStatusEnum = pgEnum("health_cover_status", [
  "independent",
  "employer_only",
  "both",
  "none",
  "not_sure"
]);
// A closed list, never free text — "why term cover does not apply" must stay
// structured rather than becoming an unreviewed place to type personal detail.
export const termNotApplicableReasonEnum = pgEnum("term_not_applicable_reason", [
  "no_financial_dependants",
  "covered_by_existing_family_arrangement",
  "other_personal_reason"
]);
export const declaredDebtKindEnum = pgEnum("declared_debt_kind", [
  "credit_card",
  "bnpl",
  "personal_loan",
  "consumer_loan",
  "other"
]);
// "resolved" means "stop counting this in planning", never "this was paid" —
// an actual payoff is a ledger transaction, not a status change here.
export const declaredDebtStatusEnum = pgEnum("declared_debt_status", ["active", "resolved"]);
export const recurringDetectionRunStatusEnum = pgEnum("recurring_detection_run_status", [
  "running",
  "completed",
  "degraded",
  "abstained",
  "failed"
]);
export const spendingChangeDirectionEnum = pgEnum("spending_change_direction", [
  "increase",
  "decrease"
]);
export const spendingRegimeTypeEnum = pgEnum("spending_regime_type", ["variable_spending"]);
export const spendingChangeRunStatusEnum = pgEnum("spending_change_run_status", [
  "running",
  "completed",
  "degraded",
  "abstained",
  "failed"
]);
export const reviewItemSourceTypeEnum = pgEnum("review_item_source_type", [
  "category_suggestion",
  "recurring_stream",
  "recurring_change",
  "spending_regime"
]);
export const reviewItemStatusEnum = pgEnum("review_item_status", [
  "active",
  "dismissed",
  "resolved",
  "stale",
  "superseded"
]);
export const safetyBufferModeEnum = pgEnum("safety_buffer_mode", [
  "fixed_amount",
  "essential_months",
  "emergency_fund_goal"
]);
export const receivableEventKindEnum = pgEnum("receivable_event_kind", [
  "opening",
  "repayment",
  "correction_increase",
  "correction_decrease",
  "legacy_increase",
  "legacy_decrease"
]);
