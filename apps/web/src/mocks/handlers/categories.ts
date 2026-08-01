import type { HttpHandler } from "msw";

import { findCategory } from "../data/store";
import { mockProblem } from "../data/problem";
import type { MockHttp, MockStore } from "./types";

export function categoryHandlers(http: MockHttp, store: MockStore): HttpHandler[] {
  return [
    http.get("/v1/categories", ({ request, response }) => {
      const includeArchived = new URL(request.url).searchParams.get("includeArchived") === "true";
      return response(200).json(
        includeArchived
          ? store.categories
          : store.categories.filter((category) => !category.isArchived)
      );
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

    http.put("/v1/categories/{categoryId}", async ({ params, request, response }) => {
      const key = request.headers.get("Idempotency-Key") ?? "";
      const replay = store.idempotency.categoryUpdate.get(key);
      if (replay !== undefined) {
        return response(200).json(replay, { headers: { "Idempotency-Replayed": "true" } });
      }

      const category = findCategory(store, params.categoryId);
      const body = await request.json();
      if (category === undefined) {
        return response(404).json(mockProblem(404, "common.not_found", "Category not found."));
      }
      if (body === undefined) {
        return response(422).json(
          mockProblem(422, "common.validation_failed", "Request body is required.")
        );
      }

      const parent = body.parentId === null ? undefined : findCategory(store, body.parentId);
      if (body.parentId === category.id || isDescendant(store, category.id, body.parentId)) {
        return response(409).json(
          mockProblem(409, "category.hierarchy_conflict", "A category cannot contain itself.")
        );
      }
      if (
        body.parentId !== null &&
        (parent === undefined || (!category.isArchived && parent.isArchived))
      ) {
        return response(409).json(
          mockProblem(409, "category.hierarchy_conflict", "The selected parent is not active.")
        );
      }
      if (parent !== undefined && parent.kind !== category.kind) {
        return response(422).json(
          mockProblem(
            422,
            "category.parent_kind_mismatch",
            "A child category must have the same kind as its parent."
          )
        );
      }
      if (!category.isArchived && hasActiveSibling(store, body.name, body.parentId, category.id)) {
        return response(409).json(nameConflict());
      }

      category.name = body.name;
      category.updatedAt = new Date().toISOString();
      setOptionalField(category, "parentId", body.parentId);
      setOptionalField(category, "icon", body.icon);
      setOptionalField(category, "color", body.color);
      store.idempotency.categoryUpdate.set(key, category);
      return response(200).json(category);
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

      const archivedAt = new Date().toISOString();
      for (const item of store.categories) {
        if (item.id === category.id || isDescendant(store, category.id, item.id)) {
          item.isArchived = true;
          item.updatedAt = archivedAt;
        }
      }
      store.idempotency.categoryArchive.add(key);
      return response(204).empty();
    }),

    http.patch("/v1/categories/{categoryId}/unarchive", ({ params, request, response }) => {
      const key = request.headers.get("Idempotency-Key") ?? "";
      const replay = store.idempotency.categoryUnarchive.get(key);
      if (replay !== undefined) {
        return response(200).json(replay, { headers: { "Idempotency-Replayed": "true" } });
      }

      const category = findCategory(store, params.categoryId);
      if (category === undefined || !category.isArchived) {
        return response(404).json(
          mockProblem(404, "common.not_found", "Archived category not found.")
        );
      }
      const parent =
        category.parentId === undefined ? undefined : findCategory(store, category.parentId);
      if (category.parentId !== undefined && (parent === undefined || parent.isArchived)) {
        return response(409).json(
          mockProblem(
            409,
            "category.hierarchy_conflict",
            "Unarchive the parent category before restoring this category."
          )
        );
      }
      if (hasActiveSibling(store, category.name, category.parentId ?? null, category.id)) {
        return response(409).json(nameConflict());
      }

      category.isArchived = false;
      category.updatedAt = new Date().toISOString();
      store.idempotency.categoryUnarchive.set(key, category);
      return response(200).json(category);
    }),

    http.delete("/v1/categories/{categoryId}/permanent", ({ params, request, response }) => {
      const key = request.headers.get("Idempotency-Key") ?? "";
      if (store.idempotency.categoryDelete.has(key)) {
        return response(204).empty({ headers: { "Idempotency-Replayed": "true" } });
      }

      const category = findCategory(store, params.categoryId);
      if (category === undefined) {
        return response(404).json(mockProblem(404, "common.not_found", "Category not found."));
      }
      if (!category.isArchived || categoryHasDependents(store, category.id)) {
        return response(409).json(
          mockProblem(
            409,
            "category.in_use",
            "This category has linked records and cannot be permanently deleted."
          )
        );
      }

      const index = store.categories.findIndex((item) => item.id === category.id);
      if (index !== -1) store.categories.splice(index, 1);
      store.idempotency.categoryDelete.add(key);
      return response(204).empty();
    })
  ];
}

function hasActiveSibling(
  store: MockStore,
  name: string,
  parentId: string | null,
  excludedId: string
): boolean {
  return store.categories.some(
    (category) =>
      !category.isArchived &&
      category.id !== excludedId &&
      category.name === name &&
      (category.parentId ?? null) === parentId
  );
}

function isDescendant(
  store: MockStore,
  categoryId: string,
  possibleDescendantId: string | null
): boolean {
  if (possibleDescendantId === null) return false;
  let current = findCategory(store, possibleDescendantId);
  while (current?.parentId !== undefined) {
    if (current.parentId === categoryId) return true;
    current = findCategory(store, current.parentId);
  }
  return false;
}

function setOptionalField(
  category: MockStore["categories"][number],
  field: "parentId" | "icon" | "color",
  value: string | null
): void {
  switch (field) {
    case "parentId":
      if (value === null) delete category.parentId;
      else category.parentId = value;
      break;
    case "icon":
      if (value === null) delete category.icon;
      else category.icon = value;
      break;
    case "color":
      if (value === null) delete category.color;
      else category.color = value;
      break;
  }
}

function categoryHasDependents(store: MockStore, categoryId: string): boolean {
  return (
    store.categories.some((category) => category.parentId === categoryId) ||
    store.transactions.some((transaction) => transaction.categoryId === categoryId) ||
    store.categoryRules.some((rule) => rule.categoryId === categoryId) ||
    store.recurringRules.some((rule) => rule.template.categoryId === categoryId) ||
    store.stagedRows.some((row) => row.suggestedCategoryId === categoryId) ||
    store.spendingWarnings.some((warning) => warning.categoryId === categoryId) ||
    store.budgets.some((budget) => budget.categoryId === categoryId)
  );
}

function nameConflict(): ReturnType<typeof mockProblem> {
  return mockProblem(
    409,
    "category.name_conflict",
    "An active sibling category already uses this name. Rename the category and try again."
  );
}
