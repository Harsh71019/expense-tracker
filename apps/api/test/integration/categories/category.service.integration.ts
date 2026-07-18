import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import { createConnection, Types } from "mongoose";
import type { Connection } from "mongoose";
import { CategoryRepository } from "../../../src/categories/category.repository.js";
import { CategoryService } from "../../../src/categories/category.service.js";
import { CategoryMutationService } from "../../../src/categories/category-mutation.service.js";
import { IdempotencyRepository } from "../../../src/common/idempotency/idempotency.repository.js";
import { IdempotencyService } from "../../../src/common/idempotency/idempotency.service.js";
import { EntityNotFoundError } from "../../../src/common/errors/entity-not-found.error.js";

describe("CategoryService", () => {
  let replicaSet: MongoMemoryReplSet | undefined;
  let connection: Connection | undefined;
  let categoryService: CategoryService | undefined;
  let categoryMutations: CategoryMutationService | undefined;

  beforeAll(async () => {
    replicaSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    connection = await createConnection(
      replicaSet.getUri("vyaya_category_service_test")
    ).asPromise();
    const repository = new CategoryRepository(connection);
    categoryService = new CategoryService(repository);
    categoryMutations = new CategoryMutationService(
      connection,
      repository,
      new IdempotencyService(new IdempotencyRepository(connection))
    );
    await connectedDatabase(connection)
      .collection("idempotency_records")
      .createIndex({ userId: 1, operation: 1, key: 1 }, { unique: true });
  });

  afterAll(async () => {
    if (connection !== undefined) await connection.close();
    if (replicaSet !== undefined) await replicaSet.stop();
  });

  it("creates and lists categories scoped by user", async () => {
    const service = getCategoryService(categoryService);

    const catA = await service.create("user-a", { name: "Food", kind: "expense" });
    const catB = await service.create("user-b", { name: "Salary", kind: "income" });

    const listA = await service.list("user-a");
    expect(listA.length).toBe(1);
    expect(listA[0]).toMatchObject({
      id: catA.id,
      userId: "user-a",
      name: "Food",
      kind: "expense"
    });

    const listB = await service.list("user-b");
    expect(listB.length).toBe(1);
    expect(listB[0]).toMatchObject({
      id: catB.id,
      userId: "user-b",
      name: "Salary",
      kind: "income"
    });
  });

  it("archives a category successfully and throws EntityNotFoundError if non-existent or owned by another user", async () => {
    const service = getCategoryService(categoryService);

    const cat = await service.create("user-a", { name: "Travel", kind: "expense" });

    // Trying to archive user-a's category as user-b should fail
    await expect(service.archive("user-b", cat.id)).rejects.toThrow(EntityNotFoundError);

    // Archiving as the correct user should succeed
    await expect(service.archive("user-a", cat.id)).resolves.toBeUndefined();

    // Archiving it again should fail since it's already archived
    await expect(service.archive("user-a", cat.id)).rejects.toThrow(EntityNotFoundError);
  });

  it("enforces parent kind equality", async () => {
    const service = getCategoryService(categoryService);
    const parent = await service.create("user-parent", { name: "Salary", kind: "income" });

    await expect(
      service.create("user-parent", {
        name: "Dining",
        kind: "expense",
        parentId: parent.id
      })
    ).rejects.toThrow("A child category must have the same kind as its parent.");
  });

  it("creates and archives exactly once across five identical mutation attempts", async () => {
    const mutations = getCategoryMutations(categoryMutations);
    const creates = await Promise.all(
      Array.from({ length: 5 }, () =>
        mutations.create(
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
      await connectedDatabase(connection)
        .collection("categories")
        .countDocuments({ userId: "user-category-idempotent", name: "Subscriptions" })
    ).toBe(1);

    const archives = await Promise.all(
      Array.from({ length: 5 }, () =>
        mutations.archive(
          "user-category-idempotent",
          categoryId,
          "44444444-aaaa-4444-8444-444444444444"
        )
      )
    );

    expect(archives.filter((result) => !result.replayed)).toHaveLength(1);
    expect(
      await connectedDatabase(connection)
        .collection("categories")
        .countDocuments({ _id: new Types.ObjectId(categoryId), isArchived: true })
    ).toBe(1);
  });
});

function getCategoryService(service: CategoryService | undefined): CategoryService {
  if (service === undefined) throw new Error("Category service is not ready");
  return service;
}

function getCategoryMutations(
  service: CategoryMutationService | undefined
): CategoryMutationService {
  if (service === undefined) throw new Error("Category mutation service is not ready");
  return service;
}

function connectedDatabase(connection: Connection | undefined): NonNullable<Connection["db"]> {
  if (connection === undefined) throw new Error("MongoDB connection is not ready");
  const database = connection.db;
  if (database === undefined) throw new Error("MongoDB database is not ready");
  return database;
}
