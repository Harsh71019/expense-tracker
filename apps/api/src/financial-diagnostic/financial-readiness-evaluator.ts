import {
  BURN_HISTORY_FRESHNESS_DAYS,
  BURN_HISTORY_REQUIRED_MONTHS,
  type FinancialAttentionLevel,
  type FinancialCapabilityKey,
  type FinancialDiagnostic,
  type FinancialDiagnosticActionKey,
  type FinancialDiagnosticOverallStatus,
  type FinancialProfileState,
  type FinancialReadinessItem,
  type FinancialReadinessStatus,
  type ProtectionState,
  type SafetyBufferState,
  type DeclaredDebtPage
} from "@treasury-ops/shared";

import type { AccountDiagnosticFacts } from "../accounts/account-diagnostic-read.service.js";
import type { AssetDiagnosticFacts } from "../assets/asset-diagnostic-read.service.js";
import type { CategoryDiagnosticFacts } from "../categories/category-diagnostic-read.service.js";
import type { GoalDiagnosticFacts } from "../goals/goal-diagnostic-read.service.js";
import type { LedgerHistoryDiagnosticFacts } from "../transactions/ledger-history-diagnostic-read.service.js";

export const DIAGNOSTIC_FORMULA_VERSION = 1;
export const DIAGNOSTIC_POLICY_VERSION = 1;

export interface ReadinessEvaluatorInput {
  readonly userId: string;
  readonly asOf: Date;
  readonly computedAt: Date;
  readonly financialProfileState: FinancialProfileState;
  readonly protectionState: ProtectionState;
  readonly declaredDebts: DeclaredDebtPage;
  readonly safetyBufferState: SafetyBufferState;
  readonly accountFacts: AccountDiagnosticFacts;
  readonly categoryFacts: CategoryDiagnosticFacts;
  readonly ledgerHistoryFacts: LedgerHistoryDiagnosticFacts;
  readonly assetFacts: AssetDiagnosticFacts;
  readonly goalFacts: GoalDiagnosticFacts;
}

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Pure, deterministic, versioned evaluator that produces the authoritative
 * Financial Readiness Diagnostic response from domain facts.
 *
 * Invariants:
 * 1. Data readiness is strictly separated from financial condition / attention.
 * 2. Missing data is NEVER presented as safe.
 * 3. Bounded machine-readable summary keys and limitations only; no freeform paragraphs.
 * 4. Zero financial amounts are returned in the response.
 */
export function evaluateFinancialReadiness(input: ReadinessEvaluatorInput): FinancialDiagnostic {
  const {
    asOf,
    computedAt,
    financialProfileState,
    protectionState,
    declaredDebts,
    safetyBufferState,
    accountFacts,
    categoryFacts,
    ledgerHistoryFacts,
    assetFacts,
    goalFacts
  } = input;

  const items: FinancialReadinessItem[] = [];

  // 1. Salary
  const hasEffectiveSalary = financialProfileState.currentSalaryVersion !== null;
  const salaryStatus: FinancialReadinessStatus = hasEffectiveSalary ? "ready" : "missing";
  const salaryAttention: FinancialAttentionLevel = hasEffectiveSalary ? "none" : "blocking";
  items.push({
    key: "salary",
    status: salaryStatus,
    attention: salaryAttention,
    source: "financial_profile",
    lastUpdatedAt:
      financialProfileState.currentSalaryVersion?.createdAt ??
      financialProfileState.profile?.updatedAt ??
      null,
    requiredFor: [
      "salary_statistics",
      "life_hour",
      "goal_feasibility",
      "payday_plan",
      "projections"
    ],
    action: hasEffectiveSalary ? null : "configure_salary",
    evidence: {
      observedCount: null,
      requiredCount: null,
      completeMonthCount: null,
      activeCount: hasEffectiveSalary ? 1 : 0,
      estimatedCount: null,
      staleCount: null,
      highCostDebtCount: null,
      missingValuationCount: null,
      latestObservedAt: financialProfileState.currentSalaryVersion?.effectiveFrom ?? null,
      oldestRelevantAt: null,
      freshnessThresholdDays: null
    },
    summaryKey: hasEffectiveSalary ? "salary.ready" : "salary.missing",
    limitationKeys: hasEffectiveSalary ? [] : ["salary.not_configured"]
  });

  // 2. Work Schedule
  const hasConfirmedWorkSchedule =
    financialProfileState.profile !== null && financialProfileState.profile.monthlyWorkMinutes > 0;
  const workScheduleStatus: FinancialReadinessStatus = hasConfirmedWorkSchedule
    ? "ready"
    : "missing";
  const workScheduleAttention: FinancialAttentionLevel = hasConfirmedWorkSchedule
    ? "none"
    : "information";
  items.push({
    key: "work_schedule",
    status: workScheduleStatus,
    attention: workScheduleAttention,
    source: "financial_profile",
    lastUpdatedAt: financialProfileState.profile?.updatedAt ?? null,
    requiredFor: ["life_hour"],
    action: hasConfirmedWorkSchedule ? null : "configure_salary",
    evidence: {
      observedCount: financialProfileState.profile?.monthlyWorkMinutes ?? null,
      requiredCount: null,
      completeMonthCount: null,
      activeCount: null,
      estimatedCount: null,
      staleCount: null,
      highCostDebtCount: null,
      missingValuationCount: null,
      latestObservedAt: null,
      oldestRelevantAt: null,
      freshnessThresholdDays: null
    },
    summaryKey: hasConfirmedWorkSchedule ? "work_schedule.ready" : "work_schedule.missing",
    limitationKeys: hasConfirmedWorkSchedule ? [] : ["work_schedule.not_confirmed"]
  });

  // 3. Accounts
  let accountsStatus: FinancialReadinessStatus;
  let accountsAttention: FinancialAttentionLevel;
  let accountsSummaryKey: string;
  const accountsLimitationKeys: string[] = [];

  if (accountFacts.activeCount === 0) {
    accountsStatus = "missing";
    accountsAttention = "blocking";
    accountsSummaryKey = "accounts.missing";
    accountsLimitationKeys.push("accounts.none_created");
  } else if (accountFacts.creditCardOnly) {
    accountsStatus = "limited";
    accountsAttention = "warning";
    accountsSummaryKey = "accounts.credit_card_only";
    accountsLimitationKeys.push("accounts.credit_card_only");
  } else {
    accountsStatus = "ready";
    accountsAttention = "none";
    accountsSummaryKey = "accounts.ready";
  }

  items.push({
    key: "accounts",
    status: accountsStatus,
    attention: accountsAttention,
    source: "accounts",
    lastUpdatedAt: accountFacts.lastUpdatedAt,
    requiredFor: [
      "essential_burn",
      "financial_runway",
      "safety_ladder",
      "payday_plan",
      "wealth_allocation"
    ],
    action: accountsStatus === "ready" ? null : "create_account",
    evidence: {
      observedCount: accountFacts.nonCreditCardCount,
      requiredCount: null,
      completeMonthCount: null,
      activeCount: accountFacts.activeCount,
      estimatedCount: null,
      staleCount: null,
      highCostDebtCount: null,
      missingValuationCount: null,
      latestObservedAt: null,
      oldestRelevantAt: null,
      freshnessThresholdDays: null
    },
    summaryKey: accountsSummaryKey,
    limitationKeys: accountsLimitationKeys
  });

  // 4. Essential Categories
  let categoriesStatus: FinancialReadinessStatus;
  let categoriesAttention: FinancialAttentionLevel;
  let categoriesSummaryKey: string;
  const categoriesLimitationKeys: string[] = [];

  if (categoryFacts.essentialExpenseCategoryCount === 0) {
    categoriesStatus = "missing";
    categoriesAttention = "warning";
    categoriesSummaryKey = "essential_categories.missing";
    categoriesLimitationKeys.push("essential_categories.none_classified");
  } else if (ledgerHistoryFacts.qualifyingTransactionCount === 0) {
    categoriesStatus = "limited";
    categoriesAttention = "information";
    categoriesSummaryKey = "essential_categories.no_qualifying_expenses";
    categoriesLimitationKeys.push("essential_categories.no_qualifying_expenses");
  } else {
    categoriesStatus = "ready";
    categoriesAttention = "none";
    categoriesSummaryKey = "essential_categories.ready";
  }

  items.push({
    key: "essential_categories",
    status: categoriesStatus,
    attention: categoriesAttention,
    source: "categories",
    lastUpdatedAt: categoryFacts.lastUpdatedAt,
    requiredFor: ["essential_burn", "financial_runway"],
    action: categoriesStatus === "ready" ? null : "review_categories",
    evidence: {
      observedCount: categoryFacts.activeExpenseCategoryCount,
      requiredCount: null,
      completeMonthCount: null,
      activeCount: categoryFacts.essentialExpenseCategoryCount,
      estimatedCount: null,
      staleCount: null,
      highCostDebtCount: null,
      missingValuationCount: null,
      latestObservedAt: null,
      oldestRelevantAt: null,
      freshnessThresholdDays: null
    },
    summaryKey: categoriesSummaryKey,
    limitationKeys: categoriesLimitationKeys
  });

  // 5. Burn History
  let burnStatus: FinancialReadinessStatus;
  let burnAttention: FinancialAttentionLevel;
  let burnSummaryKey: string;
  const burnLimitationKeys: string[] = [];

  const isBurnHistoryStale =
    ledgerHistoryFacts.latestExpenseAt !== null &&
    Math.floor((asOf.getTime() - ledgerHistoryFacts.latestExpenseAt.getTime()) / ONE_DAY_MS) >
      BURN_HISTORY_FRESHNESS_DAYS;

  if (ledgerHistoryFacts.completeMonthCount === 0) {
    burnStatus = "missing";
    burnAttention = "warning";
    burnSummaryKey = "burn_history.missing";
    burnLimitationKeys.push("burn_history.no_history");
  } else if (isBurnHistoryStale) {
    burnStatus = "stale";
    burnAttention = "warning";
    burnSummaryKey = "burn_history.stale";
    burnLimitationKeys.push("burn_history.stale");
  } else if (ledgerHistoryFacts.completeMonthCount < BURN_HISTORY_REQUIRED_MONTHS) {
    burnStatus = "limited";
    burnAttention = "information";
    burnSummaryKey = "burn_history.limited";
    burnLimitationKeys.push("burn_history.insufficient_months");
  } else {
    burnStatus = "ready";
    burnAttention = "none";
    burnSummaryKey = "burn_history.ready";
  }

  items.push({
    key: "burn_history",
    status: burnStatus,
    attention: burnAttention,
    source: "ledger",
    lastUpdatedAt: ledgerHistoryFacts.latestExpenseAt,
    requiredFor: ["essential_burn", "financial_runway"],
    action: burnStatus === "ready" ? null : "review_transactions",
    evidence: {
      observedCount: null,
      requiredCount: BURN_HISTORY_REQUIRED_MONTHS,
      completeMonthCount: ledgerHistoryFacts.completeMonthCount,
      activeCount: null,
      estimatedCount: null,
      staleCount: null,
      highCostDebtCount: null,
      missingValuationCount: null,
      latestObservedAt: ledgerHistoryFacts.latestExpenseAt,
      oldestRelevantAt: ledgerHistoryFacts.oldestExpenseAt,
      freshnessThresholdDays: BURN_HISTORY_FRESHNESS_DAYS
    },
    summaryKey: burnSummaryKey,
    limitationKeys: burnLimitationKeys
  });

  // 6. Protection (Reuse ProtectionState mapping)
  const termState = protectionState.termCover.state;
  const healthState = protectionState.healthCover.state;
  const termExpiry = protectionState.termCover.expiryState;
  const healthExpiry = protectionState.healthCover.expiryState;

  let protectionReadiness: FinancialReadinessStatus;
  let protectionAttention: FinancialAttentionLevel;
  let protectionSummaryKey: string;

  if (!protectionState.configured) {
    protectionReadiness = "missing";
    protectionAttention = "blocking";
    protectionSummaryKey = "protection.not_configured";
  } else if (termExpiry === "expired" || healthExpiry === "expired") {
    protectionReadiness = "stale";
    protectionAttention = "blocking";
    protectionSummaryKey = "protection.expired";
  } else if (termState === "unknown" || healthState === "unknown") {
    protectionReadiness = "limited";
    protectionAttention = "warning";
    protectionSummaryKey = "protection.unknown";
  } else if (termState === "incomplete" || healthState === "incomplete") {
    protectionReadiness = "limited";
    protectionAttention = "warning";
    protectionSummaryKey = "protection.incomplete";
  } else if (termState === "none_declared" || healthState === "none_declared") {
    protectionReadiness = "ready";
    protectionAttention = "blocking";
    protectionSummaryKey = "protection.none_declared";
  } else if (termState === "employer_only" || healthState === "employer_only") {
    protectionReadiness = "ready";
    protectionAttention = "warning";
    protectionSummaryKey = "protection.employer_only";
  } else if (termExpiry === "expiring" || healthExpiry === "expiring") {
    protectionReadiness = "ready";
    protectionAttention = "warning";
    protectionSummaryKey = "protection.expiring";
  } else {
    protectionReadiness = "ready";
    protectionAttention = "none";
    protectionSummaryKey = "protection.ready";
  }

  const protectionCoverCount =
    (protectionState.termCover.hasIndependentCover || protectionState.termCover.hasEmployerCover
      ? 1
      : 0) +
    (protectionState.healthCover.hasIndependentCover || protectionState.healthCover.hasEmployerCover
      ? 1
      : 0);

  items.push({
    key: "protection",
    status: protectionReadiness,
    attention: protectionAttention,
    source: "protection_profile",
    lastUpdatedAt: protectionState.currentSnapshot?.createdAt ?? null,
    requiredFor: ["safety_ladder"],
    action:
      protectionReadiness === "ready" && protectionAttention === "none"
        ? null
        : "configure_protection",
    evidence: {
      observedCount: protectionCoverCount,
      requiredCount: null,
      completeMonthCount: null,
      activeCount: null,
      estimatedCount: null,
      staleCount: null,
      highCostDebtCount: null,
      missingValuationCount: null,
      latestObservedAt: protectionState.currentSnapshot?.effectiveFrom ?? null,
      oldestRelevantAt: null,
      freshnessThresholdDays: protectionState.expiringSoonDays
    },
    summaryKey: protectionSummaryKey,
    limitationKeys: protectionState.limitations
  });

  // 7. Debt Inventory
  const activeDebts = declaredDebts.items.filter((d) => d.status === "active");
  const highCostCount = declaredDebts.highCost.highCostCount;
  const linkedDebts = activeDebts.filter((d) => d.amountSource === "linked_asset");
  const declaredOnlyDebts = activeDebts.filter((d) => d.amountSource === "declared");
  const debtsWithMissingValuation = linkedDebts.filter((d) => d.outstandingMinor === null);

  let debtStatus: FinancialReadinessStatus;
  let debtAttention: FinancialAttentionLevel;
  let debtSummaryKey: string;
  const debtLimitationKeys: string[] = [];

  if (activeDebts.length === 0) {
    debtStatus = "limited";
    debtAttention = "information";
    debtSummaryKey = "debt_inventory.none_recorded";
    debtLimitationKeys.push("debt_inventory.unverified_no_debts");
  } else if (debtsWithMissingValuation.length > 0) {
    debtStatus = "limited";
    debtAttention = highCostCount > 0 ? "blocking" : "warning";
    debtSummaryKey = "debt_inventory.missing_valuation";
    debtLimitationKeys.push("debt_inventory.missing_linked_valuation");
  } else if (declaredOnlyDebts.length > 0) {
    debtStatus = "estimated";
    debtAttention = highCostCount > 0 ? "blocking" : "none";
    debtSummaryKey =
      highCostCount > 0 ? "debt_inventory.high_cost_present" : "debt_inventory.estimated";
    debtLimitationKeys.push("debt_inventory.contains_estimates");
  } else {
    debtStatus = "ready";
    debtAttention = highCostCount > 0 ? "blocking" : "none";
    debtSummaryKey =
      highCostCount > 0 ? "debt_inventory.high_cost_present" : "debt_inventory.ready";
  }

  items.push({
    key: "debt_inventory",
    status: debtStatus,
    attention: debtAttention,
    source: "debt_profile",
    lastUpdatedAt: activeDebts.reduce<Date | null>((latest, d) => {
      const ts = d.updatedAt ?? d.createdAt;
      return latest === null || (ts && ts > latest) ? ts : latest;
    }, null),
    requiredFor: ["safety_ladder", "payday_plan"],
    action: debtStatus === "ready" && debtAttention === "none" ? null : "review_debts",
    evidence: {
      observedCount: linkedDebts.length,
      requiredCount: null,
      completeMonthCount: null,
      activeCount: activeDebts.length,
      estimatedCount: declaredOnlyDebts.length,
      staleCount: null,
      highCostDebtCount: highCostCount,
      missingValuationCount: debtsWithMissingValuation.length,
      latestObservedAt: null,
      oldestRelevantAt: null,
      freshnessThresholdDays: null
    },
    summaryKey: debtSummaryKey,
    limitationKeys: debtLimitationKeys
  });

  // 8. Safety Buffer
  let safetyBufferStatus: FinancialReadinessStatus;
  let safetyBufferAttention: FinancialAttentionLevel;
  let safetyBufferSummaryKey: string;
  const safetyBufferLimitationKeys: string[] = [];

  if (safetyBufferState.isFallback && safetyBufferState.liquidBalanceMinor <= 0) {
    safetyBufferStatus = "limited";
    safetyBufferAttention = "information";
    safetyBufferSummaryKey = "safety_buffer.limited";
    safetyBufferLimitationKeys.push("safety_buffer.no_liquid_basis");
  } else if (!safetyBufferState.isFallback && safetyBufferState.preference !== null) {
    safetyBufferStatus = "ready";
    safetyBufferAttention = "none";
    safetyBufferSummaryKey = "safety_buffer.ready";
  } else {
    safetyBufferStatus = "estimated";
    safetyBufferAttention = "information";
    safetyBufferSummaryKey = "safety_buffer.fallback_policy";
    safetyBufferLimitationKeys.push("safety_buffer.fallback_policy_in_use");
  }

  items.push({
    key: "safety_buffer",
    status: safetyBufferStatus,
    attention: safetyBufferAttention,
    source: "safety_buffer",
    lastUpdatedAt: safetyBufferState.preference?.createdAt ?? null,
    requiredFor: ["financial_runway", "safety_ladder", "goal_feasibility"],
    action: safetyBufferStatus === "ready" ? null : "configure_safety_buffer",
    evidence: {
      observedCount: safetyBufferState.preference?.version ?? null,
      requiredCount: null,
      completeMonthCount: null,
      activeCount: safetyBufferState.preference ? 1 : 0,
      estimatedCount: null,
      staleCount: null,
      highCostDebtCount: null,
      missingValuationCount: null,
      latestObservedAt: safetyBufferState.preference?.effectiveFrom ?? null,
      oldestRelevantAt: null,
      freshnessThresholdDays: null
    },
    summaryKey: safetyBufferSummaryKey,
    limitationKeys: safetyBufferLimitationKeys
  });

  // 9. Assets
  const assetsStatus: FinancialReadinessStatus = assetFacts.hasActiveAssets ? "ready" : "missing";
  const assetsAttention: FinancialAttentionLevel = assetFacts.hasActiveAssets
    ? "none"
    : "information";
  items.push({
    key: "assets",
    status: assetsStatus,
    attention: assetsAttention,
    source: "assets",
    lastUpdatedAt: assetFacts.lastUpdatedAt,
    requiredFor: ["wealth_allocation"],
    action: assetsStatus === "ready" ? null : "review_assets",
    evidence: {
      observedCount: null,
      requiredCount: null,
      completeMonthCount: null,
      activeCount: assetFacts.activeAssetCount,
      estimatedCount: null,
      staleCount: null,
      highCostDebtCount: null,
      missingValuationCount: null,
      latestObservedAt: null,
      oldestRelevantAt: null,
      freshnessThresholdDays: null
    },
    summaryKey: assetsStatus === "ready" ? "assets.ready" : "assets.none",
    limitationKeys: assetsStatus === "ready" ? [] : ["assets.none_recorded"]
  });

  // 10. Asset Valuations
  let valuationsStatus: FinancialReadinessStatus;
  let valuationsAttention: FinancialAttentionLevel;
  let valuationsSummaryKey: string;
  const valuationsLimitationKeys: string[] = [];

  if (!assetFacts.hasActiveAssets) {
    valuationsStatus = "missing";
    valuationsAttention = "information";
    valuationsSummaryKey = "asset_valuations.none";
  } else if (assetFacts.missingValuationCount > 0) {
    valuationsStatus = "limited";
    valuationsAttention = "warning";
    valuationsSummaryKey = "asset_valuations.missing_valuations";
    valuationsLimitationKeys.push("asset_valuations.missing_valuation");
  } else if (assetFacts.staleValuationCount > 0) {
    valuationsStatus = "stale";
    valuationsAttention = "warning";
    valuationsSummaryKey = "asset_valuations.stale";
    valuationsLimitationKeys.push("asset_valuations.stale_valuation");
  } else {
    valuationsStatus = "ready";
    valuationsAttention = "none";
    valuationsSummaryKey = "asset_valuations.ready";
  }

  items.push({
    key: "asset_valuations",
    status: valuationsStatus,
    attention: valuationsAttention,
    source: "assets",
    lastUpdatedAt: assetFacts.latestValuationAt,
    requiredFor: ["wealth_allocation"],
    action: valuationsStatus === "ready" ? null : "refresh_asset_valuations",
    evidence: {
      observedCount: null,
      requiredCount: null,
      completeMonthCount: null,
      activeCount: assetFacts.activeAssetCount,
      estimatedCount: null,
      staleCount: assetFacts.staleValuationCount,
      highCostDebtCount: null,
      missingValuationCount: assetFacts.missingValuationCount,
      latestObservedAt: assetFacts.latestValuationAt,
      oldestRelevantAt: null,
      freshnessThresholdDays: null
    },
    summaryKey: valuationsSummaryKey,
    limitationKeys: valuationsLimitationKeys
  });

  // 11. Goals
  const goalsStatus: FinancialReadinessStatus = goalFacts.hasActiveGoals ? "ready" : "missing";
  const goalsAttention: FinancialAttentionLevel = goalFacts.hasActiveGoals ? "none" : "information";
  items.push({
    key: "goals",
    status: goalsStatus,
    attention: goalsAttention,
    source: "goals",
    lastUpdatedAt: goalFacts.lastUpdatedAt,
    requiredFor: ["goal_feasibility"],
    action: goalsStatus === "ready" ? null : "create_goal",
    evidence: {
      observedCount: null,
      requiredCount: null,
      completeMonthCount: null,
      activeCount: goalFacts.activeGoalCount,
      estimatedCount: null,
      staleCount: null,
      highCostDebtCount: null,
      missingValuationCount: null,
      latestObservedAt: null,
      oldestRelevantAt: null,
      freshnessThresholdDays: null
    },
    summaryKey: goalsStatus === "ready" ? "goals.ready" : "goals.none",
    limitationKeys: goalsStatus === "ready" ? [] : ["goals.none_recorded"]
  });

  // Capability Availability Evaluation
  const availableCapabilities: FinancialCapabilityKey[] = [];
  const unavailableCapabilities: FinancialCapabilityKey[] = [];

  // Salary statistics: salary ready
  if (salaryStatus === "ready") {
    availableCapabilities.push("salary_statistics");
  } else {
    unavailableCapabilities.push("salary_statistics");
  }

  // Life hour: salary ready + work schedule ready
  if (salaryStatus === "ready" && workScheduleStatus === "ready") {
    availableCapabilities.push("life_hour");
  } else {
    unavailableCapabilities.push("life_hour");
  }

  // Essential burn: essential categories ready + burn history ready
  if (categoriesStatus === "ready" && burnStatus === "ready") {
    availableCapabilities.push("essential_burn");
  } else {
    unavailableCapabilities.push("essential_burn");
  }

  // Goal feasibility: salary ready + safety buffer at least estimated + goals ready
  if (
    salaryStatus === "ready" &&
    (safetyBufferStatus === "ready" || safetyBufferStatus === "estimated") &&
    goalsStatus === "ready"
  ) {
    availableCapabilities.push("goal_feasibility");
  } else {
    unavailableCapabilities.push("goal_feasibility");
  }

  // Planned engines remain unavailable in V1
  unavailableCapabilities.push("financial_runway");
  unavailableCapabilities.push("safety_ladder");
  unavailableCapabilities.push("payday_plan");
  unavailableCapabilities.push("wealth_allocation");
  unavailableCapabilities.push("projections");

  // Next action selection priority
  let nextAction: FinancialDiagnosticActionKey | null = null;

  if (salaryStatus !== "ready") {
    nextAction = "configure_salary";
  } else if (accountsStatus !== "ready") {
    nextAction = "create_account";
  } else if (categoriesStatus !== "ready") {
    nextAction = "review_categories";
  } else if (burnStatus !== "ready") {
    nextAction = "review_transactions";
  } else if (
    protectionReadiness !== "ready" ||
    protectionAttention === "blocking" ||
    protectionAttention === "warning"
  ) {
    nextAction = "configure_protection";
  } else if (debtAttention === "blocking") {
    nextAction = "review_debts";
  } else if (safetyBufferStatus !== "ready") {
    nextAction = "configure_safety_buffer";
  } else if (
    assetFacts.hasActiveAssets &&
    (valuationsStatus === "stale" || valuationsStatus === "limited")
  ) {
    nextAction = "refresh_asset_valuations";
  } else if (goalsStatus !== "ready") {
    nextAction = "create_goal";
  } else if (assetsStatus !== "ready") {
    nextAction = "review_assets";
  } else if (debtStatus !== "ready" && activeDebts.length > 0) {
    nextAction = "review_debts";
  }

  // Core base onboarding items for overall status calculation
  const coreItemKeys = [
    "salary",
    "work_schedule",
    "accounts",
    "essential_categories",
    "burn_history",
    "protection"
  ];
  const coreItems = items.filter((i) => coreItemKeys.includes(i.key));

  const hasMissingCore = coreItems.some((i) => i.status === "missing");
  const hasBlockingCore = coreItems.some((i) => i.attention === "blocking");
  const hasBlockingDebt = debtAttention === "blocking";
  const hasLimitedOrStaleOrWarningCore = coreItems.some(
    (i) =>
      i.status === "limited" ||
      i.status === "estimated" ||
      i.status === "stale" ||
      i.attention === "warning"
  );
  const hasAssetValuationIssues =
    assetFacts.hasActiveAssets && (valuationsStatus === "limited" || valuationsStatus === "stale");

  let overallStatus: FinancialDiagnosticOverallStatus;
  if (hasMissingCore || hasBlockingCore || hasBlockingDebt) {
    overallStatus = "setup_required";
  } else if (hasLimitedOrStaleOrWarningCore || hasAssetValuationIssues) {
    overallStatus = "limited";
  } else {
    overallStatus = "ready";
  }

  const readyCount = items.filter((i) => i.status === "ready").length;
  const totalRequiredCount = coreItemKeys.length;

  const limitations = items.flatMap((i) => i.limitationKeys);

  return {
    computedAt,
    sourceThrough: computedAt,
    formulaVersion: DIAGNOSTIC_FORMULA_VERSION,
    policyVersion: DIAGNOSTIC_POLICY_VERSION,
    overallStatus,
    readyCount,
    totalRequiredCount,
    availableCapabilities,
    unavailableCapabilities,
    nextAction,
    items,
    limitations
  };
}
