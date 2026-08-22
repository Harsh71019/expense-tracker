import type {
  AlgorithmResourceContract,
  CategoryRecommendation,
  CategoryRule,
  CategorySuggestion,
  CategorySuggestionMethod,
  NormalizedTransactionText,
  TransactionType
} from "@treasury-ops/shared";
import { CATEGORY_RECOMMENDATION_ALGORITHM_VERSION } from "@treasury-ops/shared";

import {
  boundedRatioBasisPoints,
  divideRoundHalfAwayFromZero,
  safeIntegerFromBigInt
} from "../common/statistics/index.js";
import { normalizeTransactionText } from "../common/transaction-text/normalize-transaction-text.js";
import {
  jaccardSimilarityBps,
  jaroWinklerSimilarityBps
} from "../common/transaction-text/similarity.js";
import {
  prepareSoftTfIdfCorpus,
  softTfIdfSimilarityBps
} from "../common/transaction-text/soft-tf-idf.js";
import type { PreparedSoftTfIdfCorpus } from "../common/transaction-text/soft-tf-idf.js";

export const CATEGORY_SUGGESTION_ALGORITHM_VERSION = 1;
export { CATEGORY_RECOMMENDATION_ALGORITHM_VERSION };
export const CATEGORY_SUGGESTION_HISTORY_LIMIT = 500;
export const CATEGORY_SUGGESTION_RESOURCE_CONTRACT = {
  lookbackDays: 3_660,
  maxRows: CATEGORY_SUGGESTION_HISTORY_LIMIT,
  batchSize: 200,
  expectedComplexity: "bounded_quadratic",
  timeoutMs: 5_000,
  degradedMode: "abstain"
} as const satisfies AlgorithmResourceContract;

const EXACT_MINIMUM_EXAMPLES = 3;
const EXACT_MINIMUM_SHARE_BPS = 8_000;
const EXACT_MINIMUM_LEAD = 2;
const MAX_NEIGHBORS = 5;

const APPROXIMATE_STAGE_SETTINGS = {
  jaro_winkler: { scoreThresholdBps: 8_800, confidenceThresholdBps: 8_000 },
  soft_tf_idf: { scoreThresholdBps: 8_200, confidenceThresholdBps: 7_500 },
  jaccard: { scoreThresholdBps: 5_000, confidenceThresholdBps: 6_500 }
} as const;

export type ApproximateCategorySuggestionStage = keyof typeof APPROXIMATE_STAGE_SETTINGS;

export type CategorySuggestionPolicy = Readonly<{
  approximateStages: readonly ApproximateCategorySuggestionStage[];
}>;

/** The simple comparator required by the chronological release gate. */
export const CATEGORY_SUGGESTION_BASELINE_POLICY: CategorySuggestionPolicy = {
  approximateStages: ["jaccard"]
};

/** Promoted only with the chronological policy comparison tests in this PR. */
export const CATEGORY_SUGGESTION_ACTIVE_POLICY: CategorySuggestionPolicy = {
  approximateStages: ["jaro_winkler", "soft_tf_idf", "jaccard"]
};

export type CategorySuggestionTarget = Readonly<{
  description: string;
  occurredAt: Date;
  type: TransactionType;
}>;

export type CategorySuggestionHistoryItem = Readonly<{
  id: string;
  categoryId: string;
  description: string;
  occurredAt: Date;
  type: TransactionType;
}>;

export type PreparedCategorySuggestionHistoryItem = Readonly<{
  id: string;
  categoryId: string;
  occurredAt: Date;
  type: TransactionType;
  text: NormalizedTransactionText;
}>;

type ScoredNeighbor = Readonly<{
  categoryId: string;
  id: string;
  occurredAt: Date;
  scoreBps: number;
}>;

type CategoryVote = Readonly<{
  categoryId: string;
  count: number;
  weight: bigint;
}>;

type ExactCounterpartyResult = Readonly<{
  matched: boolean;
  suggestion: CategorySuggestion | undefined;
}>;

export function prepareCategorySuggestionHistory(
  history: readonly CategorySuggestionHistoryItem[]
): PreparedCategorySuggestionHistoryItem[] {
  return history.map((item) => ({
    id: item.id,
    categoryId: item.categoryId,
    occurredAt: item.occurredAt,
    type: item.type,
    text: normalizeTransactionText(item.description)
  }));
}

/**
 * Rule-first, deterministic category ranking over one user's already-bounded private history.
 * The function never mutates a transaction and returns undefined when no calibrated stage wins.
 */
type FrequentCategoryAggregate = Readonly<{
  categoryId: string;
  usageCount: number;
  latestOccurredAt: Date;
  latestTransactionId: string;
}>;

function isLaterOccurrence(
  candidate: Readonly<{ occurredAt: Date; id: string }>,
  current: Readonly<{ occurredAt: Date; id: string }>
): boolean {
  const timeDelta = candidate.occurredAt.getTime() - current.occurredAt.getTime();
  if (timeDelta !== 0) return timeDelta > 0;
  return candidate.id.localeCompare(current.id) > 0;
}

function compareFrequentAggregates(
  left: FrequentCategoryAggregate,
  right: FrequentCategoryAggregate
): number {
  if (left.usageCount !== right.usageCount) return right.usageCount - left.usageCount;
  const timeDelta = right.latestOccurredAt.getTime() - left.latestOccurredAt.getTime();
  if (timeDelta !== 0) return timeDelta;
  const transactionOrder = left.latestTransactionId.localeCompare(right.latestTransactionId);
  if (transactionOrder !== 0) return transactionOrder;
  return left.categoryId.localeCompare(right.categoryId);
}

function compareHistoryNewestFirst(
  left: PreparedCategorySuggestionHistoryItem,
  right: PreparedCategorySuggestionHistoryItem
): number {
  const timeDelta = right.occurredAt.getTime() - left.occurredAt.getTime();
  return timeDelta !== 0 ? timeDelta : right.id.localeCompare(left.id);
}

function mapContextualRecommendation(suggestion: CategorySuggestion): CategoryRecommendation {
  const reason =
    suggestion.method === "explicit_rule" || suggestion.method === "exact_counterparty"
      ? suggestion.method
      : "similar_description";
  return {
    categoryId: suggestion.categoryId,
    reason,
    evidenceCount: suggestion.evidenceCount,
    confidenceBps: suggestion.confidenceBps,
    algorithmVersion: CATEGORY_RECOMMENDATION_ALGORITHM_VERSION
  };
}

export function rankFrequentCategories(
  history: readonly PreparedCategorySuggestionHistoryItem[]
): CategoryRecommendation[] {
  const aggregates = new Map<string, FrequentCategoryAggregate>();
  for (const item of history) {
    const current = aggregates.get(item.categoryId);
    if (current === undefined) {
      aggregates.set(item.categoryId, {
        categoryId: item.categoryId,
        usageCount: 1,
        latestOccurredAt: item.occurredAt,
        latestTransactionId: item.id
      });
      continue;
    }
    const later = isLaterOccurrence(item, {
      occurredAt: current.latestOccurredAt,
      id: current.latestTransactionId
    });
    aggregates.set(item.categoryId, {
      categoryId: item.categoryId,
      usageCount: current.usageCount + 1,
      latestOccurredAt: later ? item.occurredAt : current.latestOccurredAt,
      latestTransactionId: later ? item.id : current.latestTransactionId
    });
  }

  return [...aggregates.values()]
    .filter((aggregate) => aggregate.usageCount >= 2)
    .sort(compareFrequentAggregates)
    .map((aggregate) => ({
      categoryId: aggregate.categoryId,
      reason: "frequent" as const,
      evidenceCount: aggregate.usageCount,
      algorithmVersion: CATEGORY_RECOMMENDATION_ALGORITHM_VERSION
    }));
}

export function fillRecentCategories(
  history: readonly PreparedCategorySuggestionHistoryItem[],
  excludedCategoryIds: ReadonlySet<string>
): CategoryRecommendation[] {
  const counts = new Map<string, number>();
  for (const item of history) {
    counts.set(item.categoryId, (counts.get(item.categoryId) ?? 0) + 1);
  }

  const items: CategoryRecommendation[] = [];
  const seen = new Set(excludedCategoryIds);
  for (const item of [...history].sort(compareHistoryNewestFirst)) {
    if (seen.has(item.categoryId)) continue;
    seen.add(item.categoryId);
    const evidenceCount = counts.get(item.categoryId);
    if (evidenceCount === undefined || evidenceCount < 1) continue;
    items.push({
      categoryId: item.categoryId,
      reason: "recent",
      evidenceCount,
      algorithmVersion: CATEGORY_RECOMMENDATION_ALGORITHM_VERSION
    });
  }
  return items;
}

export function composeCategoryRecommendations(
  contextual: CategorySuggestion | undefined,
  history: readonly PreparedCategorySuggestionHistoryItem[],
  limit: number
): CategoryRecommendation[] {
  const items: CategoryRecommendation[] = [];
  const seen = new Set<string>();
  if (contextual !== undefined) {
    items.push(mapContextualRecommendation(contextual));
    seen.add(contextual.categoryId);
  }
  for (const frequent of rankFrequentCategories(history)) {
    if (items.length >= limit) break;
    if (seen.has(frequent.categoryId)) continue;
    items.push(frequent);
    seen.add(frequent.categoryId);
  }
  for (const recent of fillRecentCategories(history, seen)) {
    if (items.length >= limit) break;
    items.push(recent);
    seen.add(recent.categoryId);
  }
  return items.slice(0, limit);
}

export function rankCategorySuggestions(
  target: CategorySuggestionTarget,
  rules: readonly CategoryRule[],
  preparedHistory: readonly PreparedCategorySuggestionHistoryItem[],
  policy: CategorySuggestionPolicy = CATEGORY_SUGGESTION_ACTIVE_POLICY
): CategorySuggestion | undefined {
  const explicitRule = longestMatchingRule(target.description, rules);
  if (explicitRule !== undefined) {
    return suggestion(explicitRule.categoryId, 10_000, "explicit_rule", 1);
  }

  const targetText = normalizeTransactionText(target.description);
  const history = preparedHistory.filter(
    (item) => item.type === target.type && item.occurredAt.getTime() < target.occurredAt.getTime()
  );
  const exact = exactCounterpartySuggestion(targetText, history);
  if (exact.matched) return exact.suggestion;

  for (const stage of policy.approximateStages) {
    const approximate = approximateSuggestion(stage, targetText, history);
    if (approximate !== undefined) return approximate;
  }
  return undefined;
}

function suggestion(
  categoryId: string,
  confidenceBps: number,
  method: CategorySuggestionMethod,
  evidenceCount: number
): CategorySuggestion {
  return {
    categoryId,
    confidenceBps,
    method,
    evidenceCount,
    algorithmVersion: CATEGORY_SUGGESTION_ALGORITHM_VERSION
  };
}

function longestMatchingRule(
  description: string,
  rules: readonly CategoryRule[]
): CategoryRule | undefined {
  const normalizedDescription = description.normalize("NFKC").toLowerCase();
  let best: CategoryRule | undefined;
  for (const rule of rules) {
    if (!normalizedDescription.includes(rule.pattern.normalize("NFKC").toLowerCase())) continue;
    if (best === undefined || rule.pattern.length > best.pattern.length) best = rule;
  }
  return best;
}

function exactCounterpartySuggestion(
  targetText: NormalizedTransactionText,
  history: readonly PreparedCategorySuggestionHistoryItem[]
): ExactCounterpartyResult {
  if (targetText.counterpartyKey === null) return { matched: false, suggestion: undefined };
  const counts = new Map<string, number>();
  let evidenceCount = 0;
  for (const item of history) {
    if (item.text.counterpartyKey !== targetText.counterpartyKey) continue;
    counts.set(item.categoryId, (counts.get(item.categoryId) ?? 0) + 1);
    evidenceCount += 1;
  }
  if (evidenceCount < EXACT_MINIMUM_EXAMPLES) return { matched: false, suggestion: undefined };

  const ranked = [...counts.entries()].sort(([leftId, leftCount], [rightId, rightCount]) => {
    if (leftCount !== rightCount) return rightCount - leftCount;
    return leftId.localeCompare(rightId);
  });
  const winner = ranked[0];
  if (winner === undefined) return { matched: true, suggestion: undefined };
  const runnerUpCount = ranked[1]?.[1] ?? 0;
  const confidenceBps = boundedRatioBasisPoints(winner[1], evidenceCount);
  if (confidenceBps < EXACT_MINIMUM_SHARE_BPS || winner[1] - runnerUpCount < EXACT_MINIMUM_LEAD) {
    return { matched: true, suggestion: undefined };
  }
  return {
    matched: true,
    suggestion: suggestion(winner[0], confidenceBps, "exact_counterparty", winner[1])
  };
}

function approximateSuggestion(
  stage: ApproximateCategorySuggestionStage,
  targetText: NormalizedTransactionText,
  history: readonly PreparedCategorySuggestionHistoryItem[]
): CategorySuggestion | undefined {
  if (targetText.counterpartyKey === null || targetText.tokens.length === 0) return undefined;
  const settings = APPROXIMATE_STAGE_SETTINGS[stage];
  const corpus = prepareSoftTfIdfCorpus(history.map((item) => item.text.tokens));
  const neighbors: ScoredNeighbor[] = [];

  for (const item of history) {
    if (item.text.counterpartyKey === null || item.text.tokens.length === 0) continue;
    const scoreBps = stageScore(stage, targetText, item.text, corpus);
    if (scoreBps < settings.scoreThresholdBps) continue;
    neighbors.push({
      categoryId: item.categoryId,
      id: item.id,
      occurredAt: item.occurredAt,
      scoreBps
    });
  }

  const ranked = neighbors.sort(compareNeighbors).slice(0, MAX_NEIGHBORS);
  if (ranked.length < 2) return undefined;
  const votes = categoryVotes(ranked);
  const winner = votes[0];
  if (winner === undefined || winner.count < 2) return undefined;
  const runnerUp = votes[1];
  if (runnerUp !== undefined && winner.count <= runnerUp.count) return undefined;

  const totalWeight = votes.reduce((total, vote) => total + vote.weight, 0n);
  const averageWinnerScore = divideRoundHalfAwayFromZero(winner.weight, BigInt(winner.count));
  const confidenceBps = safeIntegerFromBigInt(
    divideRoundHalfAwayFromZero(averageWinnerScore * winner.weight, totalWeight),
    `${stage} category confidence`
  );
  if (confidenceBps < settings.confidenceThresholdBps) return undefined;
  return suggestion(winner.categoryId, confidenceBps, stage, winner.count);
}

function stageScore(
  stage: ApproximateCategorySuggestionStage,
  target: NormalizedTransactionText,
  candidate: NormalizedTransactionText,
  corpus: PreparedSoftTfIdfCorpus
): number {
  if (stage === "jaccard") {
    return jaccardSimilarityBps(target.tokens, candidate.tokens);
  }
  if (stage === "soft_tf_idf") {
    return softTfIdfSimilarityBps(target.tokens, candidate.tokens, corpus, {
      tokenSimilarityThresholdBps: 8_000
    });
  }
  if (
    target.counterpartyKey === null ||
    candidate.counterpartyKey === null ||
    !hasSharedMeaningfulCharacter(target.counterpartyKey, candidate.counterpartyKey)
  ) {
    return 0;
  }
  return jaroWinklerSimilarityBps(target.counterpartyKey, candidate.counterpartyKey);
}

function hasSharedMeaningfulCharacter(left: string, right: string): boolean {
  const leftCharacters = new Set(Array.from(left.replaceAll(" ", "")));
  for (const character of Array.from(right.replaceAll(" ", ""))) {
    if (leftCharacters.has(character)) return true;
  }
  return false;
}

function compareNeighbors(left: ScoredNeighbor, right: ScoredNeighbor): number {
  if (left.scoreBps !== right.scoreBps) return right.scoreBps - left.scoreBps;
  const timeOrder = right.occurredAt.getTime() - left.occurredAt.getTime();
  return timeOrder !== 0 ? timeOrder : left.id.localeCompare(right.id);
}

function categoryVotes(neighbors: readonly ScoredNeighbor[]): CategoryVote[] {
  const votes = new Map<string, { count: number; weight: bigint }>();
  for (const neighbor of neighbors) {
    const current = votes.get(neighbor.categoryId) ?? { count: 0, weight: 0n };
    votes.set(neighbor.categoryId, {
      count: current.count + 1,
      weight: current.weight + BigInt(neighbor.scoreBps)
    });
  }
  return [...votes.entries()]
    .map(([categoryId, vote]) => ({ categoryId, ...vote }))
    .sort((left, right) => {
      if (left.weight !== right.weight) return left.weight > right.weight ? -1 : 1;
      if (left.count !== right.count) return right.count - left.count;
      return left.categoryId.localeCompare(right.categoryId);
    });
}
