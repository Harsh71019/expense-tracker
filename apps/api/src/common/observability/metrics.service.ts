import { Injectable } from "@nestjs/common";
import type { AlgorithmResourceUsage } from "@treasury-ops/shared";
import { z } from "zod";

import { RedisService } from "../redis/redis.service.js";

export type QueueMetricSnapshot = Readonly<{
  queue: string;
  counts: Readonly<Record<string, number>>;
}>;

type TransactionOutcome = "committed" | "failed";
export type CategorySuggestionMetricOutcome =
  "suggested" | "accepted_unchanged" | "corrected" | "dismissed";
export type StatementAssignmentMetricOutcome =
  "matched" | "ambiguous" | "missing_from_ledger" | "resource_limit";
export type RecurringDetectionMetricOutcome = "completed" | "degraded" | "abstained" | "failed";

const RecurringDetectionMetricSnapshotSchema = z.object({
  completedRuns: z.number().int().nonnegative(),
  degradedRuns: z.number().int().nonnegative(),
  abstainedRuns: z.number().int().nonnegative(),
  failedRuns: z.number().int().nonnegative(),
  streamCount: z.number().int().nonnegative(),
  abstainedGroupCount: z.number().int().nonnegative(),
  rowsScanned: z.number().int().nonnegative(),
  runtimeMsSum: z.number().int().nonnegative(),
  runtimeCount: z.number().int().nonnegative(),
  rowBudgetHits: z.number().int().nonnegative(),
  promotionEligible: z.number().int().nonnegative(),
  promotionHeld: z.number().int().nonnegative()
});
export type RecurringDetectionMetricSnapshot = z.infer<
  typeof RecurringDetectionMetricSnapshotSchema
>;

const BALANCE_DRIFT_METRIC_KEY = "treasury-ops:metrics:balance-verification";
const RECURRING_DETECTION_METRIC_KEY = "treasury-ops:metrics:recurring-detection";
const BalanceVerificationMetricSchema = z.object({
  driftCount: z.number().int().nonnegative(),
  observedAt: z.iso.datetime({ offset: true })
});

export type BalanceVerificationMetric = z.infer<typeof BalanceVerificationMetricSchema>;

@Injectable()
export class MetricsService {
  private readonly httpRequests = new Map<string, number>();
  private readonly httpDurationMsSums = new Map<string, number>();
  private readonly httpDurationCounts = new Map<string, number>();
  private transactionRetries = 0;
  private readonly transactionOutcomes: Record<TransactionOutcome, number> = {
    committed: 0,
    failed: 0
  };
  private transactionDurationMsSum = 0;
  private transactionDurationCount = 0;
  private readonly categorySuggestionOutcomes: Record<CategorySuggestionMetricOutcome, number> = {
    suggested: 0,
    accepted_unchanged: 0,
    corrected: 0,
    dismissed: 0
  };
  private readonly statementAssignmentOutcomes: Record<StatementAssignmentMetricOutcome, number> = {
    matched: 0,
    ambiguous: 0,
    missing_from_ledger: 0,
    resource_limit: 0
  };
  constructor(private readonly redis: RedisService) {}

  recordHttp(method: string, route: string, statusCode: number, durationMs: number): void {
    const labels = httpMetricKey(method, route, statusCode);
    this.httpRequests.set(labels, (this.httpRequests.get(labels) ?? 0) + 1);
    this.httpDurationMsSums.set(labels, (this.httpDurationMsSums.get(labels) ?? 0) + durationMs);
    this.httpDurationCounts.set(labels, (this.httpDurationCounts.get(labels) ?? 0) + 1);
  }

  recordTransactionRetry(): void {
    this.transactionRetries += 1;
  }

  recordTransaction(outcome: TransactionOutcome, durationMs: number): void {
    this.transactionOutcomes[outcome] += 1;
    this.transactionDurationMsSum += durationMs;
    this.transactionDurationCount += 1;
  }

  recordCategorySuggestions(outcome: CategorySuggestionMetricOutcome, count: number): void {
    if (!Number.isSafeInteger(count) || count < 0) {
      throw new RangeError("Category suggestion metric count must be a non-negative integer.");
    }
    this.categorySuggestionOutcomes[outcome] += count;
  }

  recordStatementAssignments(outcome: StatementAssignmentMetricOutcome, count: number): void {
    if (!Number.isSafeInteger(count) || count < 0) {
      throw new RangeError("Statement assignment metric count must be a non-negative integer.");
    }
    this.statementAssignmentOutcomes[outcome] += count;
  }

  async recordRecurringDetectionRun(
    outcome: RecurringDetectionMetricOutcome,
    streamCount: number,
    abstainedGroupCount: number,
    resources: AlgorithmResourceUsage
  ): Promise<void> {
    requireMetricCount(streamCount, "Recurring detection stream");
    requireMetricCount(abstainedGroupCount, "Recurring detection abstained group");
    requireMetricCount(resources.rowsScanned, "Recurring detection rows scanned");
    requireMetricCount(resources.runtimeMs, "Recurring detection runtime");
    await Promise.all([
      this.redis.hashIncrementBy(RECURRING_DETECTION_METRIC_KEY, `runs:${outcome}`, 1),
      this.redis.hashIncrementBy(RECURRING_DETECTION_METRIC_KEY, "streams", streamCount),
      this.redis.hashIncrementBy(
        RECURRING_DETECTION_METRIC_KEY,
        "abstained_groups",
        abstainedGroupCount
      ),
      this.redis.hashIncrementBy(
        RECURRING_DETECTION_METRIC_KEY,
        "rows_scanned",
        resources.rowsScanned
      ),
      this.redis.hashIncrementBy(
        RECURRING_DETECTION_METRIC_KEY,
        "runtime_ms_sum",
        resources.runtimeMs
      ),
      this.redis.hashIncrementBy(RECURRING_DETECTION_METRIC_KEY, "runtime_count", 1),
      ...(resources.rowBudgetHit
        ? [this.redis.hashIncrementBy(RECURRING_DETECTION_METRIC_KEY, "row_budget_hits", 1)]
        : [])
    ]);
  }

  async recordRecurringDetectionPromotion(eligible: boolean): Promise<void> {
    await this.redis.hashIncrementBy(
      RECURRING_DETECTION_METRIC_KEY,
      eligible ? "promotion:eligible" : "promotion:held",
      1
    );
  }

  async readRecurringDetectionMetrics(): Promise<RecurringDetectionMetricSnapshot> {
    const values = await this.redis.hashGetAll(RECURRING_DETECTION_METRIC_KEY);
    return RecurringDetectionMetricSnapshotSchema.parse({
      completedRuns: metricHashInteger(values, "runs:completed"),
      degradedRuns: metricHashInteger(values, "runs:degraded"),
      abstainedRuns: metricHashInteger(values, "runs:abstained"),
      failedRuns: metricHashInteger(values, "runs:failed"),
      streamCount: metricHashInteger(values, "streams"),
      abstainedGroupCount: metricHashInteger(values, "abstained_groups"),
      rowsScanned: metricHashInteger(values, "rows_scanned"),
      runtimeMsSum: metricHashInteger(values, "runtime_ms_sum"),
      runtimeCount: metricHashInteger(values, "runtime_count"),
      rowBudgetHits: metricHashInteger(values, "row_budget_hits"),
      promotionEligible: metricHashInteger(values, "promotion:eligible"),
      promotionHeld: metricHashInteger(values, "promotion:held")
    });
  }

  async recordBalanceVerification(
    driftCount: number,
    observedAt: Date = new Date()
  ): Promise<void> {
    const value = BalanceVerificationMetricSchema.parse({
      driftCount,
      observedAt: observedAt.toISOString()
    });
    await this.redis.set(BALANCE_DRIFT_METRIC_KEY, JSON.stringify(value));
  }

  async readBalanceVerification(): Promise<BalanceVerificationMetric | null> {
    const serialized = await this.redis.get(BALANCE_DRIFT_METRIC_KEY);
    if (serialized === null) return null;
    const value: unknown = JSON.parse(serialized);
    return BalanceVerificationMetricSchema.parse(value);
  }

  render(
    queues: readonly QueueMetricSnapshot[],
    workerHeartbeatAgeSeconds: number | null,
    balanceVerification: BalanceVerificationMetric | null,
    now: Date = new Date(),
    recurringDetection: RecurringDetectionMetricSnapshot = emptyRecurringDetectionMetrics()
  ): string {
    const lines = [
      "# HELP treasuryops_http_requests_total HTTP requests by method, route, and status code.",
      "# TYPE treasuryops_http_requests_total counter"
    ];

    for (const [labels, count] of sortedEntries(this.httpRequests)) {
      lines.push(`treasuryops_http_requests_total{${labels}} ${count}`);
    }

    lines.push(
      "# HELP treasuryops_http_request_duration_ms HTTP request duration in milliseconds.",
      "# TYPE treasuryops_http_request_duration_ms summary"
    );
    for (const [labels, sum] of sortedEntries(this.httpDurationMsSums)) {
      lines.push(`treasuryops_http_request_duration_ms_sum{${labels}} ${finiteMetric(sum)}`);
      lines.push(
        `treasuryops_http_request_duration_ms_count{${labels}} ${this.httpDurationCounts.get(labels) ?? 0}`
      );
    }

    lines.push(
      "# HELP treasuryops_db_transaction_retries_total Retried PostgreSQL transactions.",
      "# TYPE treasuryops_db_transaction_retries_total counter",
      `treasuryops_db_transaction_retries_total ${this.transactionRetries}`,
      "# HELP treasuryops_db_transactions_total PostgreSQL transactions by final outcome.",
      "# TYPE treasuryops_db_transactions_total counter",
      `treasuryops_db_transactions_total{outcome="committed"} ${this.transactionOutcomes.committed}`,
      `treasuryops_db_transactions_total{outcome="failed"} ${this.transactionOutcomes.failed}`,
      "# HELP treasuryops_db_transaction_duration_ms Transaction duration in milliseconds.",
      "# TYPE treasuryops_db_transaction_duration_ms summary",
      `treasuryops_db_transaction_duration_ms_sum ${finiteMetric(this.transactionDurationMsSum)}`,
      `treasuryops_db_transaction_duration_ms_count ${this.transactionDurationCount}`,
      "# HELP treasuryops_category_suggestions_total Category suggestions and narration-free review outcomes.",
      "# TYPE treasuryops_category_suggestions_total counter",
      `treasuryops_category_suggestions_total{outcome="suggested"} ${this.categorySuggestionOutcomes.suggested}`,
      `treasuryops_category_suggestions_total{outcome="accepted_unchanged"} ${this.categorySuggestionOutcomes.accepted_unchanged}`,
      `treasuryops_category_suggestions_total{outcome="corrected"} ${this.categorySuggestionOutcomes.corrected}`,
      `treasuryops_category_suggestions_total{outcome="dismissed"} ${this.categorySuggestionOutcomes.dismissed}`,
      "# HELP treasuryops_statement_assignments_total Narration-free statement assignment outcomes.",
      "# TYPE treasuryops_statement_assignments_total counter",
      `treasuryops_statement_assignments_total{outcome="matched"} ${this.statementAssignmentOutcomes.matched}`,
      `treasuryops_statement_assignments_total{outcome="ambiguous"} ${this.statementAssignmentOutcomes.ambiguous}`,
      `treasuryops_statement_assignments_total{outcome="missing_from_ledger"} ${this.statementAssignmentOutcomes.missing_from_ledger}`,
      `treasuryops_statement_assignments_total{outcome="resource_limit"} ${this.statementAssignmentOutcomes.resource_limit}`,
      "# HELP treasuryops_recurring_detection_runs_total Shadow recurring-detection runs by low-cardinality outcome.",
      "# TYPE treasuryops_recurring_detection_runs_total counter",
      `treasuryops_recurring_detection_runs_total{outcome="completed"} ${recurringDetection.completedRuns}`,
      `treasuryops_recurring_detection_runs_total{outcome="degraded"} ${recurringDetection.degradedRuns}`,
      `treasuryops_recurring_detection_runs_total{outcome="abstained"} ${recurringDetection.abstainedRuns}`,
      `treasuryops_recurring_detection_runs_total{outcome="failed"} ${recurringDetection.failedRuns}`,
      "# HELP treasuryops_recurring_detection_streams_total Derived shadow streams persisted without personal labels.",
      "# TYPE treasuryops_recurring_detection_streams_total counter",
      `treasuryops_recurring_detection_streams_total ${recurringDetection.streamCount}`,
      "# HELP treasuryops_recurring_detection_abstained_groups_total Candidate groups withheld by eligibility rules.",
      "# TYPE treasuryops_recurring_detection_abstained_groups_total counter",
      `treasuryops_recurring_detection_abstained_groups_total ${recurringDetection.abstainedGroupCount}`,
      "# HELP treasuryops_recurring_detection_rows_scanned_total Historical rows processed by bounded shadow runs.",
      "# TYPE treasuryops_recurring_detection_rows_scanned_total counter",
      `treasuryops_recurring_detection_rows_scanned_total ${recurringDetection.rowsScanned}`,
      "# HELP treasuryops_recurring_detection_runtime_ms Shadow detector runtime in milliseconds.",
      "# TYPE treasuryops_recurring_detection_runtime_ms summary",
      `treasuryops_recurring_detection_runtime_ms_sum ${recurringDetection.runtimeMsSum}`,
      `treasuryops_recurring_detection_runtime_ms_count ${recurringDetection.runtimeCount}`,
      "# HELP treasuryops_recurring_detection_row_budget_hits_total Runs that disclosed a row ceiling.",
      "# TYPE treasuryops_recurring_detection_row_budget_hits_total counter",
      `treasuryops_recurring_detection_row_budget_hits_total ${recurringDetection.rowBudgetHits}`,
      "# HELP treasuryops_recurring_detection_promotion_decisions_total Aggregate chronological evaluation decisions.",
      "# TYPE treasuryops_recurring_detection_promotion_decisions_total counter",
      `treasuryops_recurring_detection_promotion_decisions_total{decision="eligible"} ${recurringDetection.promotionEligible}`,
      `treasuryops_recurring_detection_promotion_decisions_total{decision="held"} ${recurringDetection.promotionHeld}`,
      "# HELP treasuryops_queue_jobs Current BullMQ jobs by queue and state.",
      "# TYPE treasuryops_queue_jobs gauge"
    );

    for (const snapshot of queues) {
      for (const [state, count] of sortedEntries(snapshot.counts)) {
        lines.push(
          `treasuryops_queue_jobs{queue="${escapeLabel(snapshot.queue)}",state="${escapeLabel(state)}"} ${count}`
        );
      }
    }

    lines.push(
      "# HELP treasuryops_worker_heartbeat_age_seconds Seconds since the worker heartbeat; -1 means absent.",
      "# TYPE treasuryops_worker_heartbeat_age_seconds gauge",
      `treasuryops_worker_heartbeat_age_seconds ${workerHeartbeatAgeSeconds === null ? -1 : finiteMetric(workerHeartbeatAgeSeconds)}`,
      "# HELP treasuryops_balance_drift_accounts Accounts with balance drift in the last verification; -1 means no result.",
      "# TYPE treasuryops_balance_drift_accounts gauge",
      `treasuryops_balance_drift_accounts ${balanceVerification?.driftCount ?? -1}`,
      "# HELP treasuryops_balance_verification_age_seconds Seconds since the last successful balance verification; -1 means no result.",
      "# TYPE treasuryops_balance_verification_age_seconds gauge",
      `treasuryops_balance_verification_age_seconds ${balanceVerification === null ? -1 : finiteMetric(ageSeconds(balanceVerification.observedAt, now))}`
    );

    return `${lines.join("\n")}\n`;
  }
}

function requireMetricCount(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${label} metric count must be a non-negative integer.`);
  }
}

function metricHashInteger(values: Readonly<Record<string, string>>, field: string): number {
  const value = values[field];
  if (value === undefined) return 0;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new RangeError(`Recurring detection metric ${field} must be a non-negative integer.`);
  }
  return parsed;
}

function emptyRecurringDetectionMetrics(): RecurringDetectionMetricSnapshot {
  return {
    completedRuns: 0,
    degradedRuns: 0,
    abstainedRuns: 0,
    failedRuns: 0,
    streamCount: 0,
    abstainedGroupCount: 0,
    rowsScanned: 0,
    runtimeMsSum: 0,
    runtimeCount: 0,
    rowBudgetHits: 0,
    promotionEligible: 0,
    promotionHeld: 0
  };
}

function httpMetricKey(method: string, route: string, statusCode: number): string {
  return [
    `method="${escapeLabel(method.toUpperCase())}"`,
    `route="${escapeLabel(route)}"`,
    `status_code="${statusCode}"`
  ].join(",");
}

function escapeLabel(value: string): string {
  return value.replaceAll("\\", "\\\\").replaceAll("\n", "\\n").replaceAll('"', '\\"');
}

function finiteMetric(value: number): string {
  return Number.isFinite(value) ? String(value) : "0";
}

function ageSeconds(observedAt: string, now: Date): number {
  return Math.max(0, (now.getTime() - new Date(observedAt).getTime()) / 1000);
}

function sortedEntries(
  values: ReadonlyMap<string, number> | Readonly<Record<string, number>>
): [string, number][] {
  const entries = values instanceof Map ? [...values.entries()] : Object.entries(values);
  return entries.sort(([left], [right]) => left.localeCompare(right));
}
