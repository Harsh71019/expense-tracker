import type { Category, RecurringRule } from "@treasury-ops/shared";
import { describe, expect, it, vi } from "vitest";

import { calculateRecurringStats, RecurringStatsService } from "../recurring-stats.service.js";

const NOW = new Date("2026-08-03T00:00:00.000Z");
const ACCOUNT_ID = "3fa85f64-5717-4562-b3fc-2c963f66beef";
const HOUSING_ID = "3fa85f64-5717-4562-b3fc-2c963f66be01";
const SUBSCRIPTIONS_ID = "3fa85f64-5717-4562-b3fc-2c963f66be02";

function rule(
  id: string,
  input: Readonly<{
    type: "expense" | "income";
    amountMinor: number;
    rrule: string;
    nextRunAt: Date;
    categoryId?: string;
    isPaused?: boolean;
  }>
): RecurringRule {
  return {
    id,
    userId: "user-1",
    template: {
      accountId: ACCOUNT_ID,
      ...(input.categoryId === undefined ? {} : { categoryId: input.categoryId }),
      type: input.type,
      amountMinor: input.amountMinor,
      description: `Rule ${id}`,
      tags: []
    },
    rrule: input.rrule,
    startAt: input.nextRunAt,
    nextRunAt: input.nextRunAt,
    isPaused: input.isPaused ?? false,
    autoPost: true,
    createdAt: NOW,
    updatedAt: NOW
  };
}

function category(id: string, name: string): Category {
  return {
    id,
    userId: "user-1",
    name,
    kind: "expense",
    isArchived: false,
    createdAt: NOW,
    updatedAt: NOW
  };
}

describe("calculateRecurringStats", () => {
  it("compares active schedules over the same rolling 30-day window", () => {
    const stats = calculateRecurringStats(
      [
        rule("3fa85f64-5717-4562-b3fc-2c963f66be11", {
          type: "expense",
          amountMinor: 250_000,
          rrule: "FREQ=MONTHLY;BYMONTHDAY=5",
          nextRunAt: new Date("2026-08-05T00:00:00.000Z"),
          categoryId: HOUSING_ID
        }),
        rule("3fa85f64-5717-4562-b3fc-2c963f66be12", {
          type: "expense",
          amountMinor: 20_000,
          rrule: "FREQ=WEEKLY;BYDAY=MO",
          nextRunAt: new Date("2026-08-03T00:00:00.000Z"),
          categoryId: SUBSCRIPTIONS_ID
        }),
        rule("3fa85f64-5717-4562-b3fc-2c963f66be13", {
          type: "income",
          amountMinor: 800_000,
          rrule: "FREQ=MONTHLY;BYMONTHDAY=10",
          nextRunAt: new Date("2026-08-10T00:00:00.000Z")
        }),
        rule("3fa85f64-5717-4562-b3fc-2c963f66be14", {
          type: "expense",
          amountMinor: 999_999,
          rrule: "FREQ=DAILY",
          nextRunAt: new Date("2026-08-03T00:00:00.000Z"),
          isPaused: true
        })
      ],
      [category(HOUSING_ID, "Housing"), category(SUBSCRIPTIONS_ID, "Subscriptions")],
      NOW
    );

    expect(stats).toEqual({
      forecastDays: 30,
      totalRules: 4,
      activeRules: 3,
      pausedRules: 1,
      upcomingTransactionCount: 7,
      upcomingExpenseMinor: 350_000,
      upcomingIncomeMinor: 800_000,
      upcomingNetMinor: 450_000,
      topSpendingCategory: {
        categoryId: HOUSING_ID,
        name: "Housing",
        amountMinor: 250_000,
        transactionCount: 1
      },
      twelveMonthForecast: {
        forecastMonths: 12,
        transactionCount: 77,
        expenseMinor: 4_060_000,
        incomeMinor: 9_600_000,
        netMinor: 5_540_000,
        monthlyExpenseAverageMinor: 338_333,
        ruleProjections: [
          {
            recurringRuleId: "3fa85f64-5717-4562-b3fc-2c963f66be11",
            description: "Rule 3fa85f64-5717-4562-b3fc-2c963f66be11",
            type: "expense",
            amountMinor: 250_000,
            occurrenceCount: 12,
            projectedMinor: 3_000_000
          },
          {
            recurringRuleId: "3fa85f64-5717-4562-b3fc-2c963f66be12",
            description: "Rule 3fa85f64-5717-4562-b3fc-2c963f66be12",
            type: "expense",
            amountMinor: 20_000,
            occurrenceCount: 53,
            projectedMinor: 1_060_000
          },
          {
            recurringRuleId: "3fa85f64-5717-4562-b3fc-2c963f66be13",
            description: "Rule 3fa85f64-5717-4562-b3fc-2c963f66be13",
            type: "income",
            amountMinor: 800_000,
            occurrenceCount: 12,
            projectedMinor: 9_600_000
          }
        ]
      }
    });
  });

  it("groups uncategorized expenses and returns empty-safe totals", () => {
    const empty = calculateRecurringStats([], [], NOW);
    expect(empty.topSpendingCategory).toBeNull();
    expect(empty.upcomingNetMinor).toBe(0);
    expect(empty.twelveMonthForecast).toEqual({
      forecastMonths: 12,
      transactionCount: 0,
      expenseMinor: 0,
      incomeMinor: 0,
      netMinor: 0,
      monthlyExpenseAverageMinor: 0,
      ruleProjections: []
    });

    const stats = calculateRecurringStats(
      [
        rule("3fa85f64-5717-4562-b3fc-2c963f66be21", {
          type: "expense",
          amountMinor: 1_000,
          rrule: "FREQ=DAILY;COUNT=2",
          nextRunAt: NOW
        })
      ],
      [],
      NOW
    );
    expect(stats.topSpendingCategory).toMatchObject({
      name: "Uncategorized",
      amountMinor: 2_000,
      transactionCount: 2
    });
  });

  it("uses a half-open twelve-month window and excludes paused rules", () => {
    const stats = calculateRecurringStats(
      [
        rule("3fa85f64-5717-4562-b3fc-2c963f66be31", {
          type: "expense",
          amountMinor: 1_999,
          rrule: "FREQ=YEARLY",
          nextRunAt: NOW
        }),
        rule("3fa85f64-5717-4562-b3fc-2c963f66be32", {
          type: "expense",
          amountMinor: 99_999,
          rrule: "FREQ=DAILY",
          nextRunAt: NOW,
          isPaused: true
        })
      ],
      [],
      NOW
    );

    expect(stats.twelveMonthForecast.transactionCount).toBe(1);
    expect(stats.twelveMonthForecast.expenseMinor).toBe(1_999);
    expect(stats.twelveMonthForecast.ruleProjections).toHaveLength(1);
  });

  it("projects from now when a stored next run is stale", () => {
    const stats = calculateRecurringStats(
      [
        rule("3fa85f64-5717-4562-b3fc-2c963f66be41", {
          type: "expense",
          amountMinor: 2_500,
          rrule: "FREQ=MONTHLY;BYMONTHDAY=5",
          nextRunAt: new Date("2020-01-05T00:00:00.000Z")
        })
      ],
      [],
      NOW
    );

    expect(stats.twelveMonthForecast.ruleProjections[0]).toMatchObject({
      occurrenceCount: 12,
      projectedMinor: 30_000
    });
  });
});

describe("RecurringStatsService", () => {
  it("loads tenant-scoped rules and categories in parallel", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    const rules = { list: vi.fn().mockResolvedValue([]) };
    const categories = { list: vi.fn().mockResolvedValue([]) };
    // @ts-expect-error - focused repository mocks
    const service = new RecurringStatsService(rules, categories);

    await expect(service.getStats("user-1")).resolves.toMatchObject({ totalRules: 0 });
    expect(rules.list).toHaveBeenCalledWith("user-1");
    expect(categories.list).toHaveBeenCalledWith("user-1");
    vi.useRealTimers();
  });
});
