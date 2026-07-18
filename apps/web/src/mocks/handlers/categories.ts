import type { HttpHandler } from "msw";

import { findCategory } from "../data/store";
import { mockProblem } from "../data/problem";
import type { MockHttp, MockStore } from "./types";

export function categoryHandlers(http: MockHttp, store: MockStore): HttpHandler[] {
  return [
    http.get("/v1/categories", ({ response }) => {
      return response(200).json(store.categories);
    }),

    http.post("/v1/categories", async ({ request, response }) => {
      const key = request.headers.get("Idempotency-Key") ?? "";
      const existing = store.idempotency.categories.get(key);
      if (existing !== undefined) {
        return response(200).json(existing, { headers: { "Idempotency-Replayed": "true" } });
      }

      const body = await request.json();
      if (body === undefined) {
        return response(422).json(
          mockProblem(422, "common.validation_failed", "Request body is required.")
        );
      }
      const now = new Date().toISOString();
      const category = {
        id: store.nextCategoryId(),
        userId: store.profile.userId,
        name: body.name,
        kind: body.kind,
        ...(body.parentId === undefined ? {} : { parentId: body.parentId }),
        ...(body.icon === undefined ? {} : { icon: body.icon }),
        ...(body.color === undefined ? {} : { color: body.color }),
        isArchived: false,
        createdAt: now,
        updatedAt: now
      };
      store.categories.push(category);
      store.idempotency.categories.set(key, category);
      return response(201).json(category);
    }),

    http.patch("/v1/categories/{categoryId}/archive", ({ params, request, response }) => {
      const key = request.headers.get("Idempotency-Key") ?? "";
      if (store.idempotency.categoryArchive.has(key)) {
        return response(204).empty({ headers: { "Idempotency-Replayed": "true" } });
      }

      const category = findCategory(store, params.categoryId);
      if (category === undefined) {
        return response(404).json(mockProblem(404, "common.not_found", "Category not found."));
      }

      category.isArchived = true;
      category.updatedAt = new Date().toISOString();
      store.idempotency.categoryArchive.add(key);
      return response(204).empty();
    })
  ];
}
