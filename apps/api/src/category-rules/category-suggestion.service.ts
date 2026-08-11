import { Injectable } from "@nestjs/common";
import type {
  Category,
  CategoryRule,
  CategorySuggestion,
  TransactionType
} from "@treasury-ops/shared";

import { CategoryRuleRepository } from "./category-rule.repository.js";
import {
  CATEGORY_SUGGESTION_RESOURCE_CONTRACT,
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
    private readonly history: CategorySuggestionRepository
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
