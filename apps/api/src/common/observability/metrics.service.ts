import { Injectable } from "@nestjs/common";
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

const BALANCE_DRIFT_METRIC_KEY = "treasury-ops:metrics:balance-verification";
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
    now: Date = new Date()
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
