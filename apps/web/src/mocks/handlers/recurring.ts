import { computeNextOccurrence, divideMinorAmount, sumMinorAmounts } from "@treasury-ops/shared";
import type { HttpHandler } from "msw";

import { findAccount, findCategory, type RecurringStatsDto } from "../data/store";
import { mockProblem } from "../data/problem";
import type { MockHttp, MockStore } from "./types";

export function recurringHandlers(http: MockHttp, store: MockStore): HttpHandler[] {
  return [
    http.get("/v1/recurring", ({ response }) => response(200).json(store.recurringRules)),

    http.get("/v1/recurring/stats", ({ response }) => response(200).json(recurringStats(store))),

    http.post("/v1/recurring", async ({ request, response }) => {
      const key = request.headers.get("Idempotency-Key") ?? "";
      const replay = store.idempotency.recurringRules.get(key);
      if (replay !== undefined) {
        return response(200).json(replay, { headers: { "Idempotency-Replayed": "true" } });
      }
      const body = await request.json();
      if (body === undefined || body.startAt === null) {
        return response(422).json(
          mockProblem(422, "common.validation_failed", "Request body is required.")
        );
      }
      if (findAccount(store, body.template.accountId) === undefined) {
        return response(404).json(mockProblem(404, "common.not_found", "Account not found."));
      }
      if (
        body.template.categoryId !== undefined &&
        findCategory(store, body.template.categoryId) === undefined
      ) {
        return response(404).json(mockProblem(404, "common.not_found", "Category not found."));
      }
      const now = new Date().toISOString();
      const rule = {
        id: store.nextRecurringRuleId(),
        userId: store.profile.userId,
        template: { ...body.template, tags: body.template.tags ?? [] },
        rrule: body.rrule,
        startAt: body.startAt,
        nextRunAt: body.startAt,
        isPaused: false,
        autoPost: body.autoPost ?? true,
        createdAt: now,
        updatedAt: now
      };
      store.recurringRules.push(rule);
      store.idempotency.recurringRules.set(key, rule);
      return response(201).json(rule);
    }),

    http.patch("/v1/recurring/{ruleId}", async ({ params, request, response }) => {
      const key = request.headers.get("Idempotency-Key") ?? "";
      const replay = store.idempotency.recurringRules.get(key);
      if (replay !== undefined) {
        return response(200).json(replay, { headers: { "Idempotency-Replayed": "true" } });
      }
      const rule = store.recurringRules.find((candidate) => candidate.id === params.ruleId);
      if (rule === undefined) {
        return response(404).json(
          mockProblem(404, "common.not_found", "Recurring rule not found.")
        );
      }
      const body = await request.json();
      if (body === undefined) {
        return response(422).json(
          mockProblem(422, "common.validation_failed", "Request body is required.")
        );
      }
      if (body.template !== undefined) {
        const { assetId, ...template } = body.template;
        if (assetId === null) {
          const { assetId: removedAssetId, ...currentTemplate } = rule.template;
          void removedAssetId;
          rule.template = { ...currentTemplate, ...template };
        } else {
          rule.template = {
            ...rule.template,
            ...template,
            ...(assetId === undefined ? {} : { assetId })
          };
        }
      }
      if (body.rrule !== undefined) rule.rrule = body.rrule;
      if (body.isPaused !== undefined) rule.isPaused = body.isPaused;
      if (body.autoPost !== undefined) rule.autoPost = body.autoPost;
      rule.updatedAt = new Date().toISOString();
      store.idempotency.recurringRules.set(key, rule);
      return response(200).json(rule);
    })
  ];
}

function recurringStats(store: MockStore): RecurringStatsDto {
  const now = new Date();
  const windowEnd = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  const twelveMonthWindowEnd = new Date(now);
  twelveMonthWindowEnd.setUTCFullYear(twelveMonthWindowEnd.getUTCFullYear() + 1);
  const activeRules = store.recurringRules.filter((rule) => !rule.isPaused);
  const expenseAmounts: number[] = [];
  const incomeAmounts: number[] = [];
  const annualExpenseAmounts: number[] = [];
  const annualIncomeAmounts: number[] = [];
  const ruleProjections: RecurringStatsDto["twelveMonthForecast"]["ruleProjections"] = [];
  const categoryTotals = new Map<string, { amountMinor: number; transactionCount: number }>();
  let upcomingTransactionCount = 0;
  let annualTransactionCount = 0;

  for (const rule of activeRules) {
    if (rule.nextRunAt === null || rule.startAt === null) continue;
    const startAt = new Date(rule.startAt);
    const storedNextRunAt = new Date(rule.nextRunAt);
    let occurrence: Date | null =
      storedNextRunAt.getTime() >= now.getTime()
        ? storedNextRunAt
        : computeNextOccurrence(rule.rrule, startAt, new Date(now.getTime() - 1));
    const projectedAmounts: number[] = [];
    let annualOccurrenceCount = 0;
    while (occurrence !== null && occurrence.getTime() < twelveMonthWindowEnd.getTime()) {
      if (occurrence.getTime() >= now.getTime()) {
        annualTransactionCount += 1;
        annualOccurrenceCount += 1;
        projectedAmounts.push(rule.template.amountMinor);
        const isWithinThirtyDays = occurrence.getTime() <= windowEnd.getTime();
        if (rule.template.type === "income") {
          annualIncomeAmounts.push(rule.template.amountMinor);
          if (isWithinThirtyDays) {
            upcomingTransactionCount += 1;
            incomeAmounts.push(rule.template.amountMinor);
          }
        } else {
          annualExpenseAmounts.push(rule.template.amountMinor);
          if (isWithinThirtyDays) {
            upcomingTransactionCount += 1;
            expenseAmounts.push(rule.template.amountMinor);
            const key = rule.template.categoryId ?? "uncategorized";
            const current = categoryTotals.get(key);
            categoryTotals.set(key, {
              amountMinor: sumMinorAmounts([current?.amountMinor ?? 0, rule.template.amountMinor]),
              transactionCount: (current?.transactionCount ?? 0) + 1
            });
          }
        }
      }
      occurrence = computeNextOccurrence(rule.rrule, startAt, occurrence);
    }

    ruleProjections.push({
      recurringRuleId: rule.id,
      description: rule.template.description,
      type: rule.template.type,
      amountMinor: rule.template.amountMinor,
      occurrenceCount: annualOccurrenceCount,
      projectedMinor: sumMinorAmounts(projectedAmounts)
    });
  }

  const upcomingExpenseMinor = sumMinorAmounts(expenseAmounts);
  const upcomingIncomeMinor = sumMinorAmounts(incomeAmounts);
  const annualExpenseMinor = sumMinorAmounts(annualExpenseAmounts);
  const annualIncomeMinor = sumMinorAmounts(annualIncomeAmounts);
  const top = [...categoryTotals.entries()].sort(
    ([leftId, left], [rightId, right]) =>
      compareMoneyDescending(left.amountMinor, right.amountMinor) || leftId.localeCompare(rightId)
  )[0];
  const category = top === undefined ? undefined : findCategory(store, top[0]);

  return {
    forecastDays: 30,
    totalRules: store.recurringRules.length,
    activeRules: activeRules.length,
    pausedRules: store.recurringRules.length - activeRules.length,
    upcomingTransactionCount,
    upcomingExpenseMinor,
    upcomingIncomeMinor,
    upcomingNetMinor: sumMinorAmounts([upcomingIncomeMinor, -upcomingExpenseMinor]),
    topSpendingCategory:
      top === undefined
        ? null
        : {
            ...(category === undefined ? {} : { categoryId: category.id }),
            name: category?.name ?? "Uncategorized",
            ...(category?.color === undefined ? {} : { color: category.color }),
            ...(category?.icon === undefined ? {} : { icon: category.icon }),
            amountMinor: top[1].amountMinor,
            transactionCount: top[1].transactionCount
          },
    twelveMonthForecast: {
      forecastMonths: 12,
      transactionCount: annualTransactionCount,
      expenseMinor: annualExpenseMinor,
      incomeMinor: annualIncomeMinor,
      netMinor: sumMinorAmounts([annualIncomeMinor, -annualExpenseMinor]),
      monthlyExpenseAverageMinor: divideMinorAmount(annualExpenseMinor, 12),
      ruleProjections: ruleProjections.sort(compareRuleProjections)
    }
  };
}

function compareRuleProjections(
  left: RecurringStatsDto["twelveMonthForecast"]["ruleProjections"][number],
  right: RecurringStatsDto["twelveMonthForecast"]["ruleProjections"][number]
): number {
  if (left.type !== right.type) return left.type === "expense" ? -1 : 1;
  return (
    compareMoneyDescending(left.projectedMinor, right.projectedMinor) ||
    left.description.localeCompare(right.description) ||
    left.recurringRuleId.localeCompare(right.recurringRuleId)
  );
}

function compareMoneyDescending(left: number, right: number): number {
  if (left === right) return 0;
  return left > right ? -1 : 1;
}
