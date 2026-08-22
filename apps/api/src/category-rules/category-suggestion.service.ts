import { Injectable } from "@nestjs/common";
import type {
  Category,
  CategoryRecommendationInput,
  CategoryRecommendationResponse,
  CategoryRule,
  CategorySuggestion,
  TransactionType
} from "@treasury-ops/shared";
import {
  CATEGORY_RECOMMENDATION_ALGORITHM_VERSION,
  normalizeCategorySearchText
} from "@treasury-ops/shared";

import { CategoryService } from "../categories/category.service.js";
import { MetricsService } from "../common/observability/metrics.service.js";
import { CategoryRuleRepository } from "./category-rule.repository.js";
import {
  CATEGORY_SUGGESTION_RESOURCE_CONTRACT,
  composeCategoryRecommendations,
  prepareCategorySuggestionHistory,
  rankCategorySuggestions
} from "./category-suggestion-ranking.js";
import type {
  CategorySuggestionTarget,
  PreparedCategorySuggestionHistoryItem
} from "./category-suggestion-ranking.js";
import { CategorySuggestionRepository } from "./category-suggestion.repository.js";

@Injectable()
export class CategorySuggestionService {
  constructor(
    private readonly rules: CategoryRuleRepository,
    private readonly history: CategorySuggestionRepository,
    private readonly categories: CategoryService,
    private readonly metrics?: MetricsService
  ) {}

  async suggestMany(
    userId: string,
    targets: readonly CategorySuggestionTarget[],
    activeCategories: readonly Category[]
  ): Promise<(CategorySuggestion | undefined)[]> {
    if (targets.length === 0) return [];
    const startedAt = Date.now();

    const rules = await this.rules.list(userId);
    const allowedCategoryIds = categoryIdsByType(activeCategories);
    const histories = new Map<TransactionType, PreparedCategorySuggestionHistoryItem[]>();
    const rulesByType = new Map<TransactionType, CategoryRule[]>();

    for (const type of ["expense", "income"] as const) {
      const typeTargets = targets.filter((target) => target.type === type);
      if (typeTargets.length === 0) continue;
      const latestOccurredAt = new Date(
        typeTargets.reduce(
          (latest, target) => Math.max(latest, target.occurredAt.getTime()),
          Number.NEGATIVE_INFINITY
        )
      );
      const allowed = allowedCategoryIds.get(type) ?? new Set<string>();
      const history = await this.history.findHistory(userId, type, latestOccurredAt);
      histories.set(
        type,
        prepareCategorySuggestionHistory(history.filter((item) => allowed.has(item.categoryId)))
      );
      rulesByType.set(
        type,
        rules.filter((rule) => allowed.has(rule.categoryId))
      );
    }

    return targets.map((target) => {
      const rules = rulesByType.get(target.type) ?? [];
      if (Date.now() - startedAt >= CATEGORY_SUGGESTION_RESOURCE_CONTRACT.timeoutMs) {
        return rankCategorySuggestions(target, rules, [], { approximateStages: [] });
      }
      return rankCategorySuggestions(target, rules, histories.get(target.type) ?? []);
    });
  }

  async recommendForPicker(
    userId: string,
    input: CategoryRecommendationInput
  ): Promise<CategoryRecommendationResponse> {
    const startedAt = Date.now();
    const [activeCategories, rules, history] = await Promise.all([
      this.categories.list(userId, false),
      this.rules.list(userId),
      this.history.findHistory(userId, input.type, input.occurredAt)
    ]);

    const allowed = new Set(
      activeCategories
        .filter((category) => category.kind === input.type && !category.isArchived)
        .map((category) => category.id)
    );
    const prepared = prepareCategorySuggestionHistory(
      history.filter((item) => allowed.has(item.categoryId))
    );
    const eligibleRules = rules.filter((rule) => allowed.has(rule.categoryId));

    const description = input.description;
    const skipContextual =
      description === undefined || normalizeCategorySearchText(description) === "";
    let degraded = false;
    let contextual: CategorySuggestion | undefined;
    if (!skipContextual && description !== undefined) {
      const timedOut = Date.now() - startedAt >= CATEGORY_SUGGESTION_RESOURCE_CONTRACT.timeoutMs;
      degraded = timedOut;
      contextual = rankCategorySuggestions(
        { description, occurredAt: input.occurredAt, type: input.type },
        eligibleRules,
        prepared,
        timedOut ? { approximateStages: [] } : undefined
      );
      if (contextual !== undefined && !allowed.has(contextual.categoryId)) {
        contextual = undefined;
      }
    }

    const items = composeCategoryRecommendations(contextual, prepared, input.limit).filter((item) =>
      allowed.has(item.categoryId)
    );
    let sourceThrough: Date | null = null;
    for (const item of prepared) {
      if (sourceThrough === null || item.occurredAt.getTime() > sourceThrough.getTime()) {
        sourceThrough = item.occurredAt;
      }
    }

    const hasContextual = items.some(
      (item) =>
        item.reason === "explicit_rule" ||
        item.reason === "exact_counterparty" ||
        item.reason === "similar_description"
    );
    const outcome = degraded
      ? "degraded"
      : hasContextual
        ? "contextual"
        : items.length > 0
          ? "shortcut_only"
          : "empty";
    this.metrics?.recordCategoryRecommendations(outcome);

    return {
      items,
      computedAt: new Date(),
      sourceThrough,
      algorithmVersion: CATEGORY_RECOMMENDATION_ALGORITHM_VERSION,
      historyRowsConsidered: prepared.length,
      degraded
    };
  }
}

function categoryIdsByType(
  categories: readonly Category[]
): ReadonlyMap<TransactionType, ReadonlySet<string>> {
  const result = new Map<TransactionType, Set<string>>([
    ["expense", new Set<string>()],
    ["income", new Set<string>()]
  ]);
  for (const category of categories) {
    if (!category.isArchived) result.get(category.kind)?.add(category.id);
  }
  return result;
}
