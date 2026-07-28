import type { Category } from "@treasury-ops/shared";
import { describe, expect, it, vi } from "vitest";

import { CategoryParentKindMismatchError } from "../../common/errors/category-parent-kind-mismatch.error.js";
import { EntityNotFoundError } from "../../common/errors/entity-not-found.error.js";
import { CategoryMutationService } from "../category-mutation.service.js";
import { CategoryService } from "../category.service.js";

const CATEGORY_ID = "123e4567-e89b-42d3-a456-426614174000";
const PARENT_ID = "223e4567-e89b-42d3-a456-426614174000";
const NOW = new Date("2026-07-01T00:00:00.000Z");
const CATEGORY: Category = {
  id: CATEGORY_ID,
  userId: "u1",
  name: "Food",
  kind: "expense",
  isArchived: false,
  createdAt: NOW,
  updatedAt: NOW
};

describe("CategoryService", () => {
  it("creates root and same-kind child categories", async () => {
    const categories = {
      findActiveById: vi.fn().mockResolvedValue({ ...CATEGORY, id: PARENT_ID }),
      create: vi.fn().mockResolvedValue(CATEGORY)
    };
    // @ts-expect-error - focused repository double.
    const service = new CategoryService(categories);

    await expect(service.create("u1", { name: "Food", kind: "expense" })).resolves.toBe(CATEGORY);
    await expect(
      service.create("u1", { name: "Dining", kind: "expense", parentId: PARENT_ID })
    ).resolves.toBe(CATEGORY);
    expect(categories.findActiveById).toHaveBeenCalledOnce();
  });

  it("rejects missing and mismatched parents", async () => {
    for (const parent of [null, { ...CATEGORY, kind: "income" }]) {
      // @ts-expect-error - focused repository double.
      const service = new CategoryService({
        findActiveById: vi.fn().mockResolvedValue(parent)
      });
      await expect(
        service.create("u1", { name: "Dining", kind: "expense", parentId: PARENT_ID })
      ).rejects.toBeInstanceOf(
        parent === null ? EntityNotFoundError : CategoryParentKindMismatchError
      );
    }
  });

  it("lists, archives, and updates groups", async () => {
    const grouped = { ...CATEGORY, group: "essential" as const };
    const categories = {
      list: vi.fn().mockResolvedValue([CATEGORY]),
      archive: vi.fn().mockResolvedValue(true),
      updateGroup: vi.fn().mockResolvedValue(grouped)
    };
    // @ts-expect-error - focused repository double.
    const service = new CategoryService(categories);

    await expect(service.list("u1")).resolves.toEqual([CATEGORY]);
    await expect(service.archive("u1", CATEGORY_ID)).resolves.toBeUndefined();
    await expect(service.updateGroup("u1", CATEGORY_ID, { group: "essential" })).resolves.toBe(
      grouped
    );
  });

  it("rejects missing archive and group-update targets", async () => {
    // @ts-expect-error - focused repository double.
    const service = new CategoryService({
      archive: vi.fn().mockResolvedValue(false),
      updateGroup: vi.fn().mockResolvedValue(null)
    });

    await expect(service.archive("u1", CATEGORY_ID)).rejects.toBeInstanceOf(EntityNotFoundError);
    await expect(service.updateGroup("u1", CATEGORY_ID, { group: null })).rejects.toBeInstanceOf(
      EntityNotFoundError
    );
  });
});

describe("CategoryMutationService", () => {
  function mutationService(categories: object) {
    const tx = {};
    const idempotency = {
      execute: vi.fn(
        async (
          _userId: string,
          _operation: string,
          _key: string,
          _intent: unknown,
          _schema: unknown,
          work: (value: object) => Promise<unknown>
        ) => ({ result: await work(tx), replayed: false })
      )
    };
    // @ts-expect-error - focused collaborators implement the exercised operations.
    return { service: new CategoryMutationService(categories, idempotency), tx };
  }

  it("creates root and validated child categories", async () => {
    const categories = {
      findActiveById: vi.fn().mockResolvedValue({ ...CATEGORY, id: PARENT_ID }),
      create: vi.fn().mockResolvedValue(CATEGORY)
    };
    const context = mutationService(categories);

    await context.service.create("u1", { name: "Food", kind: "expense" }, "key-1");
    await context.service.create(
      "u1",
      { name: "Dining", kind: "expense", parentId: PARENT_ID },
      "key-2"
    );
    expect(categories.create).toHaveBeenLastCalledWith(
      "u1",
      expect.objectContaining({ parentId: PARENT_ID }),
      context.tx
    );
  });

  it("rejects invalid parents inside the idempotent callback", async () => {
    for (const parent of [null, { ...CATEGORY, kind: "income" }]) {
      const context = mutationService({
        findActiveById: vi.fn().mockResolvedValue(parent)
      });
      await expect(
        context.service.create(
          "u1",
          { name: "Dining", kind: "expense", parentId: PARENT_ID },
          "key"
        )
      ).rejects.toBeInstanceOf(
        parent === null ? EntityNotFoundError : CategoryParentKindMismatchError
      );
    }
  });

  it("archives and updates groups while rejecting missing targets", async () => {
    const success = mutationService({
      archive: vi.fn().mockResolvedValue(true),
      updateGroup: vi.fn().mockResolvedValue(CATEGORY)
    });
    await expect(success.service.archive("u1", CATEGORY_ID, "key")).resolves.toMatchObject({
      result: null
    });
    await expect(
      success.service.updateGroup("u1", CATEGORY_ID, { group: null }, "key")
    ).resolves.toMatchObject({ result: CATEGORY });

    const missing = mutationService({
      archive: vi.fn().mockResolvedValue(false),
      updateGroup: vi.fn().mockResolvedValue(null)
    });
    await expect(missing.service.archive("u1", CATEGORY_ID, "key")).rejects.toBeInstanceOf(
      EntityNotFoundError
    );
    await expect(
      missing.service.updateGroup("u1", CATEGORY_ID, { group: null }, "key")
    ).rejects.toBeInstanceOf(EntityNotFoundError);
  });
});
