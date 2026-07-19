import type { HttpHandler } from "msw";

import { findAccount, findCategory } from "../data/store";
import { mockProblem } from "../data/problem";
import type { MockHttp, MockStore } from "./types";

export function recurringHandlers(http: MockHttp, store: MockStore): HttpHandler[] {
  return [
    http.get("/v1/recurring", ({ response }) => response(200).json(store.recurringRules)),

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
        rule.template = { ...rule.template, ...body.template };
      }
      if (body.rrule !== undefined) rule.rrule = body.rrule;
      if (body.isPaused !== undefined) rule.isPaused = body.isPaused;
      rule.updatedAt = new Date().toISOString();
      store.idempotency.recurringRules.set(key, rule);
      return response(200).json(rule);
    })
  ];
}
