import { Inject, Injectable } from "@nestjs/common";
import type {
  DismissSpendingWarningResponse,
  ListSpendingWarningsQuery,
  SpendingWarningAnalysis,
  SpendingWarningEvidence,
  SpendingWarningKind,
  SpendingWarningPage
} from "@treasury-ops/shared";

import { AuditRepository } from "../audit/audit.repository.js";
import { DATABASE_CONNECTION } from "../common/db/db.module.js";
import type { DrizzleDb } from "../common/db/db.module.js";
import { withTxn } from "../common/db/db-txn.js";
import type { DbTx } from "../common/db/db-txn.js";
import { EntityNotFoundError } from "../common/errors/entity-not-found.error.js";
import { istCalendarDateStartUtc } from "../common/time/ist.js";
import {
  categoryFingerprint,
  DETECTOR_VERSION,
  evaluateCategorySpikes,
  evaluateLargeExpenses,
  evaluateOverallSpike,
  largeExpenseFingerprint,
  overallFingerprint
} from "./spending-warnings.detector.js";
import type {
  CategoryFinding,
  LargeExpenseFinding,
  OverallFinding
} from "./spending-warnings.detector.js";
import { SpendingWarningsRepository } from "./spending-warnings.repository.js";
import type {
  AnalysisStateRow,
  SpendingWarningUpsertInput
} from "./spending-warnings.repository.js";

const STALE_AFTER_MS = 36 * 60 * 60 * 1000;

@Injectable()
export class SpendingWarningsService {
  constructor(
    @Inject(DATABASE_CONNECTION) private readonly db: DrizzleDb,
    private readonly repository: SpendingWarningsRepository,
    private readonly audit: AuditRepository
  ) {}

  /**
   * Runs every detector for one user against a fixed `asOf`, then
   * reconciles findings into persisted warnings + analysis state in one
   * transaction (plan §5, §8). Called only from the worker's queue
   * processor — never from a request handler.
   */
  async analyzeUser(userId: string, asOf: Date): Promise<AnalysisStateRow> {
    const analysisBoundary = istCalendarDateStartUtc(asOf);

    const [overallWindows, categoryWindows, candidatePool, historyStart] = await Promise.all([
      this.repository.overallWindowSums(userId, analysisBoundary),
      this.repository.categoryWindowSums(userId, analysisBoundary),
      this.repository.largeExpenseCandidatePool(userId, analysisBoundary),
      this.repository.earliestEligibleExpenseAt(userId)
    ]);

    const overallEval = evaluateOverallSpike(overallWindows, asOf);
    const categoryEval = evaluateCategorySpikes(categoryWindows, asOf);
    const largeExpenseEval = evaluateLargeExpenses(candidatePool, asOf);

    const categoryIds = new Set<string>();
    for (const finding of categoryEval.findings) {
      if (finding.categoryId !== null) categoryIds.add(finding.categoryId);
    }
    for (const finding of largeExpenseEval.findings) {
      if (finding.categoryId !== null) categoryIds.add(finding.categoryId);
    }
    const categoryNames = await this.repository.categoryNamesByIds(userId, [...categoryIds]);

    const findings: SpendingWarningUpsertInput[] = [];
    if (overallEval.finding !== null) {
      findings.push(toOverallUpsert(overallEval.finding, asOf));
    }
    for (const finding of categoryEval.findings) {
      findings.push(toCategoryUpsert(finding, asOf, categoryNames));
    }
    for (const finding of largeExpenseEval.findings) {
      findings.push(toLargeExpenseUpsert(finding, categoryNames));
    }

    const eligibleKinds: SpendingWarningKind[] = [];
    if (overallEval.eligible) eligibleKinds.push("overall_spend_spike");
    if (categoryEval.eligibleCategoryCount > 0) eligibleKinds.push("category_spend_spike");
    if (largeExpenseEval.eligibleCandidateCount > 0) eligibleKinds.push("unusually_large_expense");

    const analysisState: AnalysisStateRow = {
      detectorVersion: DETECTOR_VERSION,
      status: eligibleKinds.length > 0 ? "ready" : "learning",
      computedAt: asOf,
      sourceThrough: analysisBoundary,
      historyStart,
      // Reuses the large-expense candidate pool row count (already fetched,
      // already bounded to the widest ~210-day analysis window) rather than
      // issuing a fourth query purely to count "how much history did we use."
      baselineExpenseCount: candidatePool.length,
      eligibleKinds
    };

    await this.repository.reconcile(userId, findings, analysisState);
    return analysisState;
  }

  async list(userId: string, query: ListSpendingWarningsQuery): Promise<SpendingWarningPage> {
    const [page, state] = await Promise.all([
      this.repository.list(userId, query),
      this.repository.getAnalysisState(userId)
    ]);
    return { ...page, analysis: buildCoverage(state) };
  }

  async dismiss(userId: string, warningId: string): Promise<DismissSpendingWarningResponse> {
    return withTxn(this.db, (tx) => this.dismissInTx(userId, warningId, tx));
  }

  async dismissInTx(
    userId: string,
    warningId: string,
    tx: DbTx
  ): Promise<DismissSpendingWarningResponse> {
    const dismissedAt = new Date();
    const result = await this.repository.markDismissed(userId, warningId, dismissedAt, tx);
    if (result === null) throw new EntityNotFoundError("Spending warning");

    if (result.transitioned) {
      await this.audit.record(userId, "spending_warning.dismissed", warningId, tx);
    }

    const resolvedDismissedAt = result.warning.dismissedAt ?? dismissedAt;
    return { id: result.warning.id, status: "dismissed", dismissedAt: resolvedDismissedAt };
  }
}

function buildCoverage(state: AnalysisStateRow | null): SpendingWarningAnalysis {
  if (state === null) {
    return { status: "unavailable", eligibleKinds: [], baselineExpenseCount: 0 };
  }
  const isStale = Date.now() - state.computedAt.getTime() > STALE_AFTER_MS;
  return {
    status: isStale ? "stale" : state.status,
    computedAt: state.computedAt,
    sourceThrough: state.sourceThrough,
    ...(state.historyStart === null ? {} : { historyStart: state.historyStart }),
    eligibleKinds: state.eligibleKinds,
    baselineExpenseCount: state.baselineExpenseCount
  };
}

function withCategoryName(
  categoryId: string | null,
  categoryNames: ReadonlyMap<string, string>
): { categoryName?: string } {
  if (categoryId === null) return {};
  const name = categoryNames.get(categoryId);
  return name === undefined ? {} : { categoryName: name };
}

function toOverallUpsert(finding: OverallFinding, asOf: Date): SpendingWarningUpsertInput {
  return {
    fingerprint: overallFingerprint(DETECTOR_VERSION, asOf),
    kind: finding.kind,
    severity: finding.severity,
    categoryId: null,
    transactionId: null,
    windowStart: finding.windowStart,
    windowEnd: finding.windowEnd,
    evidence: finding.evidence,
    detectorVersion: DETECTOR_VERSION
  };
}

function toCategoryUpsert(
  finding: CategoryFinding,
  asOf: Date,
  categoryNames: ReadonlyMap<string, string>
): SpendingWarningUpsertInput {
  const evidence: SpendingWarningEvidence = {
    ...finding.evidence,
    ...withCategoryName(finding.categoryId, categoryNames)
  };
  return {
    fingerprint: categoryFingerprint(DETECTOR_VERSION, finding.categoryId, asOf),
    kind: finding.kind,
    severity: finding.severity,
    categoryId: finding.categoryId,
    transactionId: null,
    windowStart: finding.windowStart,
    windowEnd: finding.windowEnd,
    evidence,
    detectorVersion: DETECTOR_VERSION
  };
}

function toLargeExpenseUpsert(
  finding: LargeExpenseFinding,
  categoryNames: ReadonlyMap<string, string>
): SpendingWarningUpsertInput {
  const evidence: SpendingWarningEvidence = {
    ...finding.evidence,
    ...withCategoryName(finding.categoryId, categoryNames)
  };
  return {
    fingerprint: largeExpenseFingerprint(DETECTOR_VERSION, finding.transactionId),
    kind: finding.kind,
    severity: finding.severity,
    categoryId: finding.categoryId,
    transactionId: finding.transactionId,
    windowStart: finding.windowStart,
    windowEnd: finding.windowEnd,
    evidence,
    detectorVersion: DETECTOR_VERSION
  };
}
