import type { Category, CategoryRule } from "@treasury-ops/shared";
import { describe, expect, it, vi } from "vitest";

import { CategoryService } from "../../categories/category.service.js";
import { focusedTestDouble } from "../../test/mock-drizzle.js";
import { CategoryRuleRepository } from "../category-rule.repository.js";
import { CategorySuggestionRepository } from "../category-suggestion.repository.js";
import { CategorySuggestionService } from "../category-suggestion.service.js";

const FOOD_ID = "123e4567-e89b-42d3-a456-426614174001";
const ARCHIVED_ID = "123e4567-e89b-42d3-a456-426614174002";
const NOW = new Date("2026-01-20T00:00:00.000Z");

function category(id: string, isArchived: boolean): Category {
  return {
    id,
    userId: "user-1",
    name: id === FOOD_ID ? "Food" : "Old food",
    kind: "expense",
    isArchived,
    createdAt: new Date("2025-01-01T00:00:00.000Z"),
    updatedAt: new Date("2025-01-01T00:00:00.000Z")
  };
}

describe("CategorySuggestionService", () => {
  it("loads bounded history with tenant and type, and excludes archived categories", async () => {
    const rules: CategoryRule[] = [
      {
        id: "123e4567-e89b-42d3-a456-426614174010",
        userId: "user-1",
        pattern: "NEVER MATCH",
        categoryId: ARCHIVED_ID,
        createdAt: NOW,
        updatedAt: NOW
      }
    ];
    const findHistory = vi.fn().mockResolvedValue([
      ...[1, 2, 3].map((day) => ({
        id: `history-${day}`,
        categoryId: FOOD_ID,
        description: "SWIGGY",
        occurredAt: new Date(Date.UTC(2026, 0, day)),
        type: "expense" as const
      })),
      {
        id: "archived-history",
        categoryId: ARCHIVED_ID,
        description: "SWIGGY",
        occurredAt: new Date(Date.UTC(2026, 0, 4)),
        type: "expense" as const
      }
    ]);
    const service = new CategorySuggestionService(
      focusedTestDouble<CategoryRuleRepository>({ list: vi.fn().mockResolvedValue(rules) }),
      focusedTestDouble<CategorySuggestionRepository>({ findHistory }),
      focusedTestDouble<CategoryService>({ list: vi.fn() })
    );

    const results = await service.suggestMany(
      "user-1",
      [{ description: "SWIGGY", occurredAt: NOW, type: "expense" }],
      [category(FOOD_ID, false), category(ARCHIVED_ID, true)]
    );

    expect(findHistory).toHaveBeenCalledWith("user-1", "expense", NOW);
    expect(results[0]).toMatchObject({
      categoryId: FOOD_ID,
      method: "exact_counterparty",
      evidenceCount: 3
    });
  });

  it("does not query unused transaction types and handles an empty batch", async () => {
    const findHistory = vi.fn().mockResolvedValue([]);
    const list = vi.fn().mockResolvedValue([]);
    const service = new CategorySuggestionService(
      focusedTestDouble<CategoryRuleRepository>({ list }),
      focusedTestDouble<CategorySuggestionRepository>({ findHistory }),
      focusedTestDouble<CategoryService>({ list: vi.fn() })
    );

    await expect(service.suggestMany("user-1", [], [])).resolves.toEqual([]);
    expect(list).not.toHaveBeenCalled();

    await service.suggestMany(
      "user-1",
      [{ description: "SALARY", occurredAt: NOW, type: "income" }],
      []
    );
    expect(findHistory).toHaveBeenCalledOnce();
    expect(findHistory).toHaveBeenCalledWith("user-1", "income", NOW);
  });

  it("degrades to explicit rules when the evaluation time budget is exhausted", async () => {
    const dateNow = vi.spyOn(Date, "now").mockReturnValueOnce(0).mockReturnValue(5_000);
    const rules: CategoryRule[] = [
      {
        id: "123e4567-e89b-42d3-a456-426614174010",
        userId: "user-1",
        pattern: "RENT",
        categoryId: FOOD_ID,
        createdAt: NOW,
        updatedAt: NOW
      }
    ];
    const service = new CategorySuggestionService(
      focusedTestDouble<CategoryRuleRepository>({ list: vi.fn().mockResolvedValue(rules) }),
      focusedTestDouble<CategorySuggestionRepository>({
        findHistory: vi.fn().mockResolvedValue(
          [1, 2, 3].map((day) => ({
            id: `history-${day}`,
            categoryId: FOOD_ID,
            description: "SWIGGY",
            occurredAt: new Date(Date.UTC(2026, 0, day)),
            type: "expense" as const
          }))
        )
      }),
      focusedTestDouble<CategoryService>({ list: vi.fn() })
    );

    try {
      const results = await service.suggestMany(
        "user-1",
        [
          { description: "SWIGGY", occurredAt: NOW, type: "expense" },
          { description: "MONTHLY RENT", occurredAt: NOW, type: "expense" }
        ],
        [category(FOOD_ID, false)]
      );
      expect(results[0]).toBeUndefined();
      expect(results[1]).toMatchObject({ method: "explicit_rule", categoryId: FOOD_ID });
    } finally {
      dateNow.mockRestore();
    }
  });

  it("composes picker recommendations without mutating history and filters archived ids", async () => {
    const listCategories = vi.fn().mockResolvedValue([category(FOOD_ID, false)]);
    const findHistory = vi.fn().mockResolvedValue([
      ...[1, 2, 3].map((day) => ({
        id: `history-${day}`,
        categoryId: FOOD_ID,
        description: "SWIGGY",
        occurredAt: new Date(Date.UTC(2026, 0, day)),
        type: "expense" as const
      })),
      {
        id: "archived-history",
        categoryId: ARCHIVED_ID,
        description: "SWIGGY",
        occurredAt: new Date(Date.UTC(2026, 0, 4)),
        type: "expense" as const
      }
    ]);
    const service = new CategorySuggestionService(
      focusedTestDouble<CategoryRuleRepository>({ list: vi.fn().mockResolvedValue([]) }),
      focusedTestDouble<CategorySuggestionRepository>({ findHistory }),
      focusedTestDouble<CategoryService>({ list: listCategories })
    );

    const result = await service.recommendForPicker("user-1", {
      type: "expense",
      description: "SWIGGY",
      occurredAt: NOW,
      limit: 5
    });

    expect(findHistory).toHaveBeenCalledWith("user-1", "expense", NOW);
    expect(result.items[0]).toMatchObject({
      categoryId: FOOD_ID,
      reason: "exact_counterparty"
    });
    expect(result.items.every((item) => item.categoryId !== ARCHIVED_ID)).toBe(true);
    expect(result.degraded).toBe(false);
    expect(result.historyRowsConsidered).toBe(3);
  });

  it("skips contextual ranking for blank descriptions and still returns shortcuts", async () => {
    const service = new CategorySuggestionService(
      focusedTestDouble<CategoryRuleRepository>({ list: vi.fn().mockResolvedValue([]) }),
      focusedTestDouble<CategorySuggestionRepository>({
        findHistory: vi.fn().mockResolvedValue([
          {
            id: "history-1",
            categoryId: FOOD_ID,
            description: "SWIGGY",
            occurredAt: new Date(Date.UTC(2026, 0, 1)),
            type: "expense" as const
          },
          {
            id: "history-2",
            categoryId: FOOD_ID,
            description: "ZOMATO",
            occurredAt: new Date(Date.UTC(2026, 0, 2)),
            type: "expense" as const
          }
        ])
      }),
      focusedTestDouble<CategoryService>({
        list: vi.fn().mockResolvedValue([category(FOOD_ID, false)])
      })
    );

    const result = await service.recommendForPicker("user-1", {
      type: "expense",
      occurredAt: NOW,
      limit: 5
    });
    expect(result.items[0]).toMatchObject({ reason: "frequent", categoryId: FOOD_ID });
    expect(result.degraded).toBe(false);
  });

  it("marks picker results degraded when the contextual budget is exhausted", async () => {
    const dateNow = vi.spyOn(Date, "now").mockReturnValueOnce(0).mockReturnValue(5_000);
    const service = new CategorySuggestionService(
      focusedTestDouble<CategoryRuleRepository>({ list: vi.fn().mockResolvedValue([]) }),
      focusedTestDouble<CategorySuggestionRepository>({
        findHistory: vi.fn().mockResolvedValue([
          {
            id: "history-1",
            categoryId: FOOD_ID,
            description: "SWIGGY",
            occurredAt: new Date(Date.UTC(2026, 0, 1)),
            type: "expense" as const
          },
          {
            id: "history-2",
            categoryId: FOOD_ID,
            description: "ZOMATO",
            occurredAt: new Date(Date.UTC(2026, 0, 2)),
            type: "expense" as const
          }
        ])
      }),
      focusedTestDouble<CategoryService>({
        list: vi.fn().mockResolvedValue([category(FOOD_ID, false)])
      })
    );

    try {
      const result = await service.recommendForPicker("user-1", {
        type: "expense",
        description: "IRCTC TICKET",
        occurredAt: NOW,
        limit: 5
      });
      expect(result.degraded).toBe(true);
      expect(result.items[0]).toMatchObject({ reason: "frequent", categoryId: FOOD_ID });
    } finally {
      dateNow.mockRestore();
    }
  });
});
