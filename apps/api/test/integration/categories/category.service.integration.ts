import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import { createConnection } from "mongoose";
import type { Connection } from "mongoose";
import { CategoryRepository } from "../../../src/categories/category.repository.js";
import { CategoryService } from "../../../src/categories/category.service.js";
import { EntityNotFoundError } from "../../../src/common/errors/entity-not-found.error.js";

describe("CategoryService", () => {
  let replicaSet: MongoMemoryReplSet | undefined;
  let connection: Connection | undefined;
  let categoryService: CategoryService | undefined;

  beforeAll(async () => {
    replicaSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    connection = await createConnection(
      replicaSet.getUri("vyaya_category_service_test")
    ).asPromise();
    const repository = new CategoryRepository(connection);
    categoryService = new CategoryService(repository);
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
});

function getCategoryService(service: CategoryService | undefined): CategoryService {
  if (service === undefined) throw new Error("Category service is not ready");
  return service;
}
