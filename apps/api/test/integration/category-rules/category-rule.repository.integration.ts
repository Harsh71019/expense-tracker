import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import { createConnection } from "mongoose";
import type { Connection } from "mongoose";

import { CategoryRuleRepository } from "../../../src/category-rules/category-rule.repository.js";

describe("CategoryRuleRepository", () => {
  let replicaSet: MongoMemoryReplSet | undefined;
  let connection: Connection | undefined;
  let rules: CategoryRuleRepository | undefined;

  beforeAll(async () => {
    replicaSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    connection = await createConnection(replicaSet.getUri("vyaya_category_rules_test")).asPromise();
    rules = new CategoryRuleRepository(connection);
  });

  afterAll(async () => {
    if (connection !== undefined) await connection.close();
    if (replicaSet !== undefined) await replicaSet.stop();
  });

  it("creates and lists rules scoped to the user, sorted by pattern", async () => {
    const repository = categoryRuleRepository(rules);
    const categoryId = "0123456789abcdef01234567";
    await repository.create("user-a", { pattern: "SWIGGY", categoryId });
    await repository.create("user-a", { pattern: "IRCTC", categoryId });
    await repository.create("user-b", { pattern: "ZOMATO", categoryId });

    const userARules = await repository.list("user-a");
    expect(userARules.map((rule) => rule.pattern)).toEqual(["IRCTC", "SWIGGY"]);
    expect(await repository.list("user-b")).toHaveLength(1);
  });

  it("deletes a rule only when it belongs to the requesting user", async () => {
    const repository = categoryRuleRepository(rules);
    const rule = await repository.create("user-delete", {
      pattern: "AMAZON",
      categoryId: "0123456789abcdef01234567"
    });

    expect(await repository.delete("someone-else", rule.id)).toBe(false);
    expect(await repository.delete("user-delete", rule.id)).toBe(true);
    expect(await repository.list("user-delete")).toEqual([]);
  });
});

function categoryRuleRepository(
  repository: CategoryRuleRepository | undefined
): CategoryRuleRepository {
  if (repository === undefined) {
    throw new Error("Category rule repository is not ready");
  }
  return repository;
}
