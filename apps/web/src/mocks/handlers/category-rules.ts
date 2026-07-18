import type { HttpHandler } from "msw";

import { findCategory } from "../data/store";
import { mockProblem } from "../data/problem";
import type { MockHttp, MockStore } from "./types";

export function categoryRuleHandlers(http: MockHttp, store: MockStore): HttpHandler[] {
  return [
    http.get("/v1/category-rules", ({ response }) => {
      return response(200).json(store.categoryRules);
    }),

    http.post("/v1/category-rules", async ({ request, response }) => {
      const key = request.headers.get("Idempotency-Key") ?? "";
      const existing = store.idempotency.categoryRules.get(key);
      if (existing !== undefined) {
        return response(200).json(existing, { headers: { "Idempotency-Replayed": "true" } });
      }

      const body = await request.json();
      if (body === undefined) {
        return response(422).json(
          mockProblem(422, "common.validation_failed", "Request body is required.")
        );
      }
      if (findCategory(store, body.categoryId) === undefined) {
        return response(404).json(mockProblem(404, "common.not_found", "Category not found."));
      }

      const now = new Date().toISOString();
      const rule = {
        id: store.nextCategoryRuleId(),
        userId: store.profile.userId,
        pattern: body.pattern,
        categoryId: body.categoryId,
        createdAt: now,
        updatedAt: now
      };
      store.categoryRules.push(rule);
      store.idempotency.categoryRules.set(key, rule);
      return response(201).json(rule);
    }),

    http.delete("/v1/category-rules/{ruleId}", ({ params, request, response }) => {
      const key = request.headers.get("Idempotency-Key") ?? "";
      if (store.idempotency.categoryRuleDelete.has(key)) {
        return response(204).empty({ headers: { "Idempotency-Replayed": "true" } });
      }

      const index = store.categoryRules.findIndex((rule) => rule.id === params.ruleId);
      if (index === -1) {
        return response(404).json(mockProblem(404, "common.not_found", "Category rule not found."));
      }

      store.categoryRules.splice(index, 1);
      store.idempotency.categoryRuleDelete.add(key);
      return response(204).empty();
    })
  ];
}
