import type {
  CategorySpendSpikeEvidence,
  OverallSpendSpikeEvidence,
  SpendingWarningSeverity,
  UnusuallyLargeExpenseEvidence
} from "@treasury-ops/shared";

import {
  addDaysUtc,
  istCalendarDateStartUtc,
  toISTMonth,
  toISTWeekStart
} from "../common/time/ist.js";

/**
 * Bumped whenever the detection rules below change in a way that should
 * invalidate previously-computed fingerprints/evidence (plan §5). Folded
 * into every fingerprint and persisted on every warning/analysis-state row.
 */
export const DETECTOR_VERSION = 1;

const OVERALL_WINDOW_DAYS = 7;
const OVERALL_BASELINE_WINDOWS = 8;
const OVERALL_MIN_NON_ZERO_BASELINE_WINDOWS = 6;
const OVERALL_MIN_BASELINE_EXPENSES = 20;
const OVERALL_TRIGGER_FLOOR_MINOR = 300_000;

const CATEGORY_WINDOW_DAYS = 30;
const CATEGORY_BASELINE_WINDOWS = 6;
const CATEGORY_MIN_NON_ZERO_BASELINE_WINDOWS = 4;
const CATEGORY_MIN_BASELINE_EXPENSES = 12;
const CATEGORY_MIN_CURRENT_EXPENSES = 3;
const CATEGORY_TRIGGER_FLOOR_MINOR = 200_000;
const CATEGORY_MAX_RESULTS = 4;

const LARGE_EXPENSE_CANDIDATE_WINDOW_DAYS = 30;
const LARGE_EXPENSE_BASELINE_DAYS = 180;
const LARGE_EXPENSE_MIN_BASELINE = 12;
const LARGE_EXPENSE_MIN_THRESHOLD_MINOR = 500_000;
const LARGE_EXPENSE_MAX_RESULTS = 5;

const TRIGGER_RATIO_BPS = 15_000n; // 150%
const HIGH_SEVERITY_RATIO_BPS = 20_000n; // 200%
const HIGH_SEVERITY_FLOOR_MINOR = 1_000_000;

/** `current * 10_000 >= baseline * thresholdBps` without float rounding. */
function meetsRatio(currentMinor: number, baselineMinor: number, thresholdBps: bigint): boolean {
  return BigInt(currentMinor) * 10_000n >= BigInt(baselineMinor) * thresholdBps;
}

function ratioBasisPoints(currentMinor: number, baselineMinor: number): number {
  if (baselineMinor <= 0) return 0;
  return Number((BigInt(currentMinor) * 10_000n) / BigInt(baselineMinor));
}

/**
 * PostgreSQL `percentile_disc` semantics (NIST box-plot rule, plan §3):
 * after sorting ascending, return the smallest-ranked value whose
 * cumulative distribution is >= `p`. Keeps quartiles exact members of the
 * dataset (integer paise), never an interpolated float.
 */
export function percentileDisc(sortedAscending: readonly number[], p: number): number {
  if (sortedAscending.length === 0) {
    throw new RangeError("percentileDisc requires a non-empty array.");
  }
  const index = Math.min(
    sortedAscending.length,
    Math.max(1, Math.ceil(p * sortedAscending.length))
  );
  const value = sortedAscending[index - 1];
  if (value === undefined) {
    throw new RangeError("percentileDisc computed an out-of-range index.");
  }
  return value;
}

function median(sortedAscending: readonly number[]): number {
  return percentileDisc(sortedAscending, 0.5);
}

function sortAscending(values: readonly number[]): number[] {
  return [...values].sort((a, b) => a - b);
}

// ---------------------------------------------------------------------------
// Overall spend spike
// ---------------------------------------------------------------------------

/** One 7-day (or 30-day, for category windows) bucket's aggregate. windowIndex 0 is the current window; 1..N are baseline windows, ordered most-recent-first. */
export type WindowSum = Readonly<{
  windowIndex: number;
  totalMinor: number;
  expenseCount: number;
}>;

export type OverallFinding = Readonly<{
  kind: "overall_spend_spike";
  severity: SpendingWarningSeverity;
  windowStart: Date;
  windowEnd: Date;
  deltaMinor: number;
  evidence: OverallSpendSpikeEvidence;
}>;

export type OverallEvaluation = Readonly<{
  eligible: boolean;
  finding: OverallFinding | null;
}>;

export function evaluateOverallSpike(windows: readonly WindowSum[], asOf: Date): OverallEvaluation {
  const current = windows.find((w) => w.windowIndex === 0);
  const baseline = windows.filter(
    (w) => w.windowIndex >= 1 && w.windowIndex <= OVERALL_BASELINE_WINDOWS
  );
  const currentMinor = current?.totalMinor ?? 0;

  const nonZeroBaselineWindows = baseline.filter((w) => w.totalMinor > 0);
  const baselineExpenseCount = baseline.reduce((sum, w) => sum + w.expenseCount, 0);
  const eligible =
    nonZeroBaselineWindows.length >= OVERALL_MIN_NON_ZERO_BASELINE_WINDOWS &&
    baselineExpenseCount >= OVERALL_MIN_BASELINE_EXPENSES;

  if (!eligible) return { eligible: false, finding: null };

  const baselineMedianMinor = median(sortAscending(baseline.map((w) => w.totalMinor)));
  if (baselineMedianMinor <= 0) return { eligible: true, finding: null };
  if (!meetsRatio(currentMinor, baselineMedianMinor, TRIGGER_RATIO_BPS)) {
    return { eligible: true, finding: null };
  }

  const deltaMinor = currentMinor - baselineMedianMinor;
  if (deltaMinor < OVERALL_TRIGGER_FLOOR_MINOR) return { eligible: true, finding: null };

  const severity: SpendingWarningSeverity =
    meetsRatio(currentMinor, baselineMedianMinor, HIGH_SEVERITY_RATIO_BPS) &&
    deltaMinor >= HIGH_SEVERITY_FLOOR_MINOR
      ? "high"
      : "attention";

  const windowEnd = istCalendarDateStartUtc(asOf);
  const windowStart = addDaysUtc(windowEnd, -OVERALL_WINDOW_DAYS);

  return {
    eligible: true,
    finding: {
      kind: "overall_spend_spike",
      severity,
      windowStart,
      windowEnd,
      deltaMinor,
      evidence: {
        kind: "overall_spend_spike",
        currentMinor,
        baselineMedianMinor,
        deltaMinor,
        ratioBasisPoints: ratioBasisPoints(currentMinor, baselineMedianMinor),
        windowStart,
        windowEnd,
        baselineWindowCount: nonZeroBaselineWindows.length,
        baselineExpenseCount
      }
    }
  };
}

export function overallFingerprint(detectorVersion: number, asOf: Date): string {
  return `v${detectorVersion}:overall_spend_spike:${toISTWeekStart(asOf)}`;
}

// ---------------------------------------------------------------------------
// Category spend spike
// ---------------------------------------------------------------------------

export type CategoryWindowSum = WindowSum & Readonly<{ categoryId: string | null }>;

export type CategoryFinding = Readonly<{
  kind: "category_spend_spike";
  severity: SpendingWarningSeverity;
  categoryId: string | null;
  windowStart: Date;
  windowEnd: Date;
  deltaMinor: number;
  /** `categoryName` is left blank here — the detector never touches the DB; the service enriches it before persisting. */
  evidence: CategorySpendSpikeEvidence;
}>;

export type CategoryEvaluation = Readonly<{
  eligibleCategoryCount: number;
  findings: CategoryFinding[];
}>;

export function evaluateCategorySpikes(
  windows: readonly CategoryWindowSum[],
  asOf: Date
): CategoryEvaluation {
  const byCategory = new Map<string, CategoryWindowSum[]>();
  for (const row of windows) {
    const key = row.categoryId ?? "";
    const group = byCategory.get(key);
    if (group === undefined) byCategory.set(key, [row]);
    else group.push(row);
  }

  const windowEnd = istCalendarDateStartUtc(asOf);
  const windowStart = addDaysUtc(windowEnd, -CATEGORY_WINDOW_DAYS);

  let eligibleCategoryCount = 0;
  const findings: CategoryFinding[] = [];

  for (const [key, group] of byCategory) {
    const categoryId = key === "" ? null : key;
    const current = group.find((w) => w.windowIndex === 0);
    const baseline = group.filter(
      (w) => w.windowIndex >= 1 && w.windowIndex <= CATEGORY_BASELINE_WINDOWS
    );
    const currentMinor = current?.totalMinor ?? 0;
    const currentExpenseCount = current?.expenseCount ?? 0;

    const nonZeroBaselineWindows = baseline.filter((w) => w.totalMinor > 0);
    const baselineExpenseCount = baseline.reduce((sum, w) => sum + w.expenseCount, 0);
    const eligible =
      currentExpenseCount >= CATEGORY_MIN_CURRENT_EXPENSES &&
      nonZeroBaselineWindows.length >= CATEGORY_MIN_NON_ZERO_BASELINE_WINDOWS &&
      baselineExpenseCount >= CATEGORY_MIN_BASELINE_EXPENSES;
    if (!eligible) continue;
    eligibleCategoryCount += 1;

    const baselineMedianMinor = median(sortAscending(baseline.map((w) => w.totalMinor)));
    if (baselineMedianMinor <= 0) continue;
    if (!meetsRatio(currentMinor, baselineMedianMinor, TRIGGER_RATIO_BPS)) continue;

    const deltaMinor = currentMinor - baselineMedianMinor;
    if (deltaMinor < CATEGORY_TRIGGER_FLOOR_MINOR) continue;

    const severity: SpendingWarningSeverity =
      meetsRatio(currentMinor, baselineMedianMinor, HIGH_SEVERITY_RATIO_BPS) &&
      deltaMinor >= HIGH_SEVERITY_FLOOR_MINOR
        ? "high"
        : "attention";

    findings.push({
      kind: "category_spend_spike",
      severity,
      categoryId,
      windowStart,
      windowEnd,
      deltaMinor,
      evidence: {
        kind: "category_spend_spike",
        ...(categoryId === null ? {} : { categoryId }),
        currentMinor,
        baselineMedianMinor,
        deltaMinor,
        ratioBasisPoints: ratioBasisPoints(currentMinor, baselineMedianMinor),
        windowStart,
        windowEnd,
        baselineWindowCount: nonZeroBaselineWindows.length,
        baselineExpenseCount,
        currentExpenseCount
      }
    });
  }

  findings.sort((a, b) => b.deltaMinor - a.deltaMinor);
  return { eligibleCategoryCount, findings: findings.slice(0, CATEGORY_MAX_RESULTS) };
}

export function categoryFingerprint(
  detectorVersion: number,
  categoryId: string | null,
  asOf: Date
): string {
  return `v${detectorVersion}:category_spend_spike:${categoryId ?? "uncategorized"}:${toISTMonth(asOf)}`;
}

// ---------------------------------------------------------------------------
// Unusually large expense
// ---------------------------------------------------------------------------

export type CandidateExpenseRow = Readonly<{
  transactionId: string;
  categoryId: string | null;
  amountMinor: number;
  occurredAt: Date;
}>;

export type LargeExpenseFinding = Readonly<{
  kind: "unusually_large_expense";
  severity: SpendingWarningSeverity;
  transactionId: string;
  categoryId: string | null;
  windowStart: Date;
  windowEnd: Date;
  occurredAt: Date;
  /** `categoryName` is left blank here — enriched by the service before persisting. */
  evidence: UnusuallyLargeExpenseEvidence;
}>;

export type LargeExpenseEvaluation = Readonly<{
  eligibleCandidateCount: number;
  findings: LargeExpenseFinding[];
}>;

/**
 * `rows` must already be bounded to the ~210-day (30 + 180) range the
 * repository fetches (plan §8) — every candidate's dynamic baseline window
 * is computed here, purely in memory, since it depends on the candidate's
 * own `occurredAt` rather than a fixed analysis-wide boundary.
 */
export function evaluateLargeExpenses(
  rows: readonly CandidateExpenseRow[],
  asOf: Date
): LargeExpenseEvaluation {
  const windowEnd = istCalendarDateStartUtc(asOf);
  const candidateWindowStart = addDaysUtc(windowEnd, -LARGE_EXPENSE_CANDIDATE_WINDOW_DAYS);
  const candidates = rows.filter(
    (row) => row.occurredAt >= candidateWindowStart && row.occurredAt < windowEnd
  );

  let eligibleCandidateCount = 0;
  const findings: LargeExpenseFinding[] = [];

  for (const candidate of candidates) {
    const baselineStart = addDaysUtc(candidate.occurredAt, -LARGE_EXPENSE_BASELINE_DAYS);
    const baseline = rows.filter(
      (row) =>
        row.transactionId !== candidate.transactionId &&
        row.categoryId === candidate.categoryId &&
        row.occurredAt >= baselineStart &&
        row.occurredAt < candidate.occurredAt
    );
    if (baseline.length < LARGE_EXPENSE_MIN_BASELINE) continue;
    eligibleCandidateCount += 1;

    const sorted = sortAscending(baseline.map((b) => b.amountMinor));
    const q1 = percentileDisc(sorted, 0.25);
    const med = percentileDisc(sorted, 0.5);
    const q3 = percentileDisc(sorted, 0.75);
    const iqr = q3 - q1;
    const threshold = Math.max(LARGE_EXPENSE_MIN_THRESHOLD_MINOR, 3 * med, q3 + 3 * iqr);
    if (candidate.amountMinor < threshold) continue;

    const severity: SpendingWarningSeverity =
      candidate.amountMinor >= 2 * threshold ? "high" : "attention";

    findings.push({
      kind: "unusually_large_expense",
      severity,
      transactionId: candidate.transactionId,
      categoryId: candidate.categoryId,
      windowStart: baselineStart,
      windowEnd: candidate.occurredAt,
      occurredAt: candidate.occurredAt,
      evidence: {
        kind: "unusually_large_expense",
        transactionId: candidate.transactionId,
        ...(candidate.categoryId === null ? {} : { categoryId: candidate.categoryId }),
        amountMinor: candidate.amountMinor,
        thresholdMinor: threshold,
        baselineMedianMinor: med,
        baselineQ1Minor: q1,
        baselineQ3Minor: q3,
        baselineExpenseCount: baseline.length,
        occurredAt: candidate.occurredAt
      }
    });
  }

  findings.sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime());
  return { eligibleCandidateCount, findings: findings.slice(0, LARGE_EXPENSE_MAX_RESULTS) };
}

export function largeExpenseFingerprint(detectorVersion: number, transactionId: string): string {
  return `v${detectorVersion}:unusually_large_expense:${transactionId}`;
}
