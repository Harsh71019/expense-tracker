import type {
  AlgorithmResourceContract,
  NearDuplicateEvidence,
  NearDuplicateMethod,
  NearDuplicateResult,
  TransactionSource
} from "@treasury-ops/shared";

import { toISTCalendarDate } from "../common/time/ist.js";
import { normalizeTransactionText } from "../common/transaction-text/normalize-transaction-text.js";
import { jaccardSimilarityBps } from "../common/transaction-text/similarity.js";

export const NEAR_DUPLICATE_ALGORITHM_VERSION = 1;

/**
 * Blocking (same user/account/type/amount, a narrow calendar-day window) is
 * the caller's responsibility — the candidate window query in
 * TransactionRepository plus a per-row filter in ImportsService. This module
 * only ever runs the approximate comparison over an already-blocked,
 * already-bounded candidate set.
 */
export const NEAR_DUPLICATE_RESOURCE_CONTRACT = {
  lookbackDays: 3,
  maxRows: 2_000,
  batchSize: 200,
  expectedComplexity: "linear",
  timeoutMs: 2_000,
  degradedMode: "abstain"
} as const satisfies AlgorithmResourceContract;

/** How many calendar days on either side of the target's IST day are blocked into candidates. */
export const NEAR_DUPLICATE_DAY_WINDOW = 1;

const MINIMUM_CONFIDENCE_BPS = 5_000;
const AMBIGUITY_MARGIN_BPS = 1_500;
const EXACT_REFERENCE_CONFIDENCE_BPS = 9_500;
const COUNTERPARTY_KEY_CONFIDENCE_BPS = 8_000;

export type NearDuplicateTarget = Readonly<{
  description: string;
  occurredAt: Date;
}>;

export type NearDuplicateCandidate = Readonly<{
  transactionId: string;
  description: string;
  source: TransactionSource;
  occurredAt: Date;
}>;

export function calendarDayDistance(left: Date, right: Date): number {
  const leftDay = Date.parse(`${toISTCalendarDate(left)}T00:00:00.000Z`);
  const rightDay = Date.parse(`${toISTCalendarDate(right)}T00:00:00.000Z`);
  return Math.round(Math.abs(leftDay - rightDay) / (24 * 60 * 60 * 1000));
}

function scoreCandidate(
  target: Readonly<{
    counterpartyKey: string | null;
    tokens: readonly string[];
    referenceTokens: readonly Readonly<{ kind: string; value: string }>[];
    occurredAt: Date;
  }>,
  candidate: NearDuplicateCandidate
): NearDuplicateEvidence {
  const candidateText = normalizeTransactionText(candidate.description);
  const hasExactReferenceMatch = target.referenceTokens.some((reference) =>
    candidateText.referenceTokens.some(
      (candidateReference) =>
        candidateReference.kind === reference.kind && candidateReference.value === reference.value
    )
  );
  const hasCounterpartyKeyMatch =
    target.counterpartyKey !== null && target.counterpartyKey === candidateText.counterpartyKey;
  const tokenJaccardBps = jaccardSimilarityBps(target.tokens, candidateText.tokens);

  let method: NearDuplicateMethod;
  let confidenceBps: number;
  if (hasExactReferenceMatch) {
    method = "exact_reference";
    confidenceBps = EXACT_REFERENCE_CONFIDENCE_BPS;
  } else if (hasCounterpartyKeyMatch) {
    method = "counterparty_key";
    confidenceBps = Math.max(COUNTERPARTY_KEY_CONFIDENCE_BPS, tokenJaccardBps);
  } else {
    method = "token_jaccard";
    confidenceBps = tokenJaccardBps;
  }

  return {
    candidateTransactionId: candidate.transactionId,
    method,
    confidenceBps,
    hasExactReferenceMatch,
    hasCounterpartyKeyMatch,
    tokenJaccardBps,
    calendarDayDistance: calendarDayDistance(target.occurredAt, candidate.occurredAt),
    candidateSource: candidate.source,
    algorithmVersion: NEAR_DUPLICATE_ALGORITHM_VERSION
  };
}

function compareEvidence(left: NearDuplicateEvidence, right: NearDuplicateEvidence): number {
  if (left.confidenceBps !== right.confidenceBps) return right.confidenceBps - left.confidenceBps;
  return left.candidateTransactionId.localeCompare(right.candidateTransactionId);
}

/**
 * Scores an already-blocked candidate set against one target narration and
 * returns an explicit match/ambiguous/abstained result — never a bare
 * boolean. A "match" is review evidence only: the caller must never use it
 * to auto-exclude, auto-reject, or otherwise mutate a row or a ledger entry.
 */
export function evaluateNearDuplicates(
  target: NearDuplicateTarget,
  candidates: readonly NearDuplicateCandidate[]
): NearDuplicateResult {
  if (candidates.length === 0) {
    return {
      outcome: "abstained",
      reason: "no_candidates",
      algorithmVersion: NEAR_DUPLICATE_ALGORITHM_VERSION
    };
  }

  const targetText = normalizeTransactionText(target.description);
  const scored = candidates
    .map((candidate) => scoreCandidate({ ...targetText, occurredAt: target.occurredAt }, candidate))
    .filter((evidence) => evidence.confidenceBps >= MINIMUM_CONFIDENCE_BPS)
    .sort(compareEvidence);

  const best = scored[0];
  if (best === undefined) {
    return {
      outcome: "abstained",
      reason: "insufficient_evidence",
      algorithmVersion: NEAR_DUPLICATE_ALGORITHM_VERSION
    };
  }

  const runnerUp = scored[1];
  if (
    runnerUp !== undefined &&
    best.confidenceBps - runnerUp.confidenceBps < AMBIGUITY_MARGIN_BPS
  ) {
    return { outcome: "ambiguous", candidateCount: scored.length, topEvidence: best };
  }

  return { outcome: "match", evidence: best };
}
