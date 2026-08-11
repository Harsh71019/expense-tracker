import type { CategoryDecisionMetrics, CategoryRule, TransactionType } from "@treasury-ops/shared";

import { calculateCategoryDecisionMetrics } from "../common/algorithm-evaluation/index.js";
import {
  CATEGORY_SUGGESTION_ACTIVE_POLICY,
  CATEGORY_SUGGESTION_BASELINE_POLICY,
  prepareCategorySuggestionHistory,
  rankCategorySuggestions
} from "./category-suggestion-ranking.js";
import type {
  CategorySuggestionHistoryItem,
  CategorySuggestionPolicy
} from "./category-suggestion-ranking.js";

export type LabeledCategorySuggestionPoint = Readonly<{
  id: string;
  categoryId: string;
  description: string;
  occurredAt: Date;
  type: TransactionType;
  amountMinor: number;
}>;

export type CategorySuggestionPolicyComparison = Readonly<{
  baseline: CategoryDecisionMetrics;
  candidate: CategoryDecisionMetrics;
  approximateStagesPromotable: boolean;
}>;

/** Expanding one-step evaluation: each prediction can see only strictly older labeled rows. */
export function evaluateCategorySuggestionsChronologically(
  points: readonly LabeledCategorySuggestionPoint[],
  rules: readonly CategoryRule[],
  policy: CategorySuggestionPolicy
): CategoryDecisionMetrics {
  validateChronology(points);
  const observations = points.slice(1).map((target, index) => {
    const training = points.slice(0, index + 1).map(toHistoryItem);
    const prediction = rankCategorySuggestions(
      target,
      rules,
      prepareCategorySuggestionHistory(training),
      policy
    );
    return {
      actualLabel: target.categoryId,
      predictedLabel: prediction?.categoryId ?? null,
      amountMinor: target.amountMinor
    };
  });
  return calculateCategoryDecisionMetrics(observations);
}

export function compareCategorySuggestionPoliciesChronologically(
  points: readonly LabeledCategorySuggestionPoint[],
  rules: readonly CategoryRule[]
): CategorySuggestionPolicyComparison {
  const baseline = evaluateCategorySuggestionsChronologically(
    points,
    rules,
    CATEGORY_SUGGESTION_BASELINE_POLICY
  );
  const candidate = evaluateCategorySuggestionsChronologically(
    points,
    rules,
    CATEGORY_SUGGESTION_ACTIVE_POLICY
  );
  return {
    baseline,
    candidate,
    approximateStagesPromotable:
      candidate.correctCount > baseline.correctCount &&
      candidate.coverageBps >= baseline.coverageBps &&
      precision(candidate) >= precision(baseline)
  };
}

function toHistoryItem(point: LabeledCategorySuggestionPoint): CategorySuggestionHistoryItem {
  return {
    id: point.id,
    categoryId: point.categoryId,
    description: point.description,
    occurredAt: point.occurredAt,
    type: point.type
  };
}

function precision(metrics: CategoryDecisionMetrics): number {
  return metrics.top1PrecisionBps ?? 0;
}

function validateChronology(points: readonly LabeledCategorySuggestionPoint[]): void {
  let previous = Number.NEGATIVE_INFINITY;
  for (const point of points) {
    const current = point.occurredAt.getTime();
    if (!Number.isSafeInteger(point.amountMinor) || point.amountMinor <= 0) {
      throw new RangeError("Chronological category evaluation amounts must be positive integers.");
    }
    if (!Number.isFinite(current) || current <= previous) {
      throw new RangeError("Chronological category evaluation dates must be strictly increasing.");
    }
    previous = current;
  }
}
