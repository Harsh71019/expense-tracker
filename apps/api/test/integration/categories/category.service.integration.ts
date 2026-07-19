import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";

import { CategoryRepository } from "../../../src/categories/category.repository.js";
import { CategoryService } from "../../../src/categories/category.service.js";
import { CategoryMutationService } from "../../../src/categories/category-mutation.service.js";
import { IdempotencyPostgresRepository } from "../../../src/common/idempotency/idempotency-postgres.repository.js";
import { IdempotencyPostgresService } from "../../../src/common/idempotency/idempotency-postgres.service.js";
import { EntityNotFoundError } from "../../../src/common/errors/entity-not-found.error.js";
import { categories } from "../../../src/common/db/schema/index.js";
import { createTestDb, insertTestUser } from "../support/postgres-test-db.js";
import type { TestDb } from "../support/postgres-test-db.js";

describe("CategoryService", () => {
  let testDb: TestDb;
  let categoryService: CategoryService;
  let categoryMutations: CategoryMutationService;

  beforeAll(async () => {
    testDb = await createTestDb();
    const repository = new CategoryRepository(testDb.db);
    categoryService = new CategoryService(repository);
    categoryMutations = new CategoryMutationService(
      repository,
      new IdempotencyPostgresService(testDb.db, new IdempotencyPostgresRepository(testDb.db))
    );
    await insertTestUser(testDb.db, "user-a");
    await insertTestUser(testDb.db, "user-b");
    await insertTestUser(testDb.db, "user-parent");
    await insertTestUser(testDb.db, "user-category-idempotent");
  }, 60_000);

  afterAll(async () => {
    await testDb.teardown();
  });

  it("creates and lists categories scoped by user", async () => {
    const catA = await categoryService.create("user-a", { name: "Food", kind: "expense" });
    const catB = await categoryService.create("user-b", { name: "Salary", kind: "income" });

    const listA = await categoryService.list("user-a");
    expect(listA.length).toBe(1);
    expect(listA[0]).toMatchObject({
      id: catA.id,
      userId: "user-a",
      name: "Food",
      kind: "expense"
    });

    const listB = await categoryService.list("user-b");
    expect(listB.length).toBe(1);
    expect(listB[0]).toMatchObject({
      id: catB.id,
      userId: "user-b",
      name: "Salary",
      kind: "income"
    });
  });

  it("archives a category successfully and throws EntityNotFoundError if non-existent or owned by another user", async () => {
    const cat = await categoryService.create("user-a", { name: "Travel", kind: "expense" });

    // Trying to archive user-a's category as user-b should fail
    await expect(categoryService.archive("user-b", cat.id)).rejects.toThrow(EntityNotFoundError);

    // Archiving as the correct user should succeed
    await expect(categoryService.archive("user-a", cat.id)).resolves.toBeUndefined();

    // Archiving it again should fail since it's already archived
    await expect(categoryService.archive("user-a", cat.id)).rejects.toThrow(EntityNotFoundError);
  });

  it("enforces parent kind equality", async () => {
    const parent = await categoryService.create("user-parent", { name: "Salary", kind: "income" });

    await expect(
      categoryService.create("user-parent", {
        name: "Dining",
        kind: "expense",
        parentId: parent.id
      })
    ).rejects.toThrow("A child category must have the same kind as its parent.");
  });

  it("creates and archives exactly once across five identical mutation attempts", async () => {
    const creates = await Promise.all(
      Array.from({ length: 5 }, () =>
        categoryMutations.create(
          "user-category-idempotent",
          { name: "Subscriptions", kind: "expense" },
          "33333333-aaaa-4333-8333-333333333333"
        )
      )
    );

    expect(creates.filter((result) => !result.replayed)).toHaveLength(1);
    const categoryId = creates[0]?.result.id;
    if (categoryId === undefined) throw new Error("Expected a created category");
    expect(
      (
        await testDb.db
          .select()
          .from(categories)
          .where(
            and(
              eq(categories.userId, "user-category-idempotent"),
              eq(categories.name, "Subscriptions")
            )
          )
      ).length
    ).toBe(1);

    const archives = await Promise.all(
      Array.from({ length: 5 }, () =>
        categoryMutations.archive(
          "user-category-idempotent",
          categoryId,
          "44444444-aaaa-4444-8444-444444444444"
        )
      )
    );

    expect(archives.filter((result) => !result.replayed)).toHaveLength(1);
    expect(
      (
        await testDb.db
          .select()
          .from(categories)
          .where(and(eq(categories.id, categoryId), eq(categories.isArchived, true)))
      ).length
    ).toBe(1);
  });
});
