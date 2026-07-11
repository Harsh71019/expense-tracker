import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import { createConnection } from "mongoose";
import type { Connection } from "mongoose";

import { CategoryRepository } from "../../src/categories/category.repository.js";

describe("CategoryRepository tenancy and archive behavior", () => {
  let replicaSet: MongoMemoryReplSet | undefined;
  let connection: Connection | undefined;
  let categories: CategoryRepository | undefined;

  beforeAll(async () => {
    replicaSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    connection = await createConnection(replicaSet.getUri("vyaya_categories_test")).asPromise();
    categories = new CategoryRepository(connection);
  });

  afterAll(async () => {
    if (connection !== undefined) await connection.close();
    if (replicaSet !== undefined) await replicaSet.stop();
  });

  it("scopes category access to the authenticated user", async () => {
    const repository = categoryRepository(categories);
    const aCategory = await repository.create("user-a", { name: "Food", kind: "expense" });
    const bCategory = await repository.create("user-b", { name: "Food", kind: "expense" });

    expect(await repository.list("user-a")).toMatchObject([{ id: aCategory.id, userId: "user-a" }]);
    expect(await repository.list("user-b")).toMatchObject([{ id: bCategory.id, userId: "user-b" }]);
    expect(await repository.archive("user-a", bCategory.id)).toBe(false);
    expect(await repository.archive("user-a", aCategory.id)).toBe(true);
    expect(await repository.list("user-a")).toEqual([]);
  });
});

function categoryRepository(repository: CategoryRepository | undefined): CategoryRepository {
  if (repository === undefined) throw new Error("Category repository is not ready");
  return repository;
}
