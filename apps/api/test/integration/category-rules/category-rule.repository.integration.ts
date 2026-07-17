import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import { createConnection } from "mongoose";
import type { Connection } from "mongoose";

import { CategoryRuleRepository } from "../../../src/category-rules/category-rule.repository.js";
import { CategoryRuleMutationService } from "../../../src/category-rules/category-rule-mutation.service.js";
import { CategoryRepository } from "../../../src/categories/category.repository.js";
import { IdempotencyRepository } from "../../../src/common/idempotency/idempotency.repository.js";
import { IdempotencyService } from "../../../src/common/idempotency/idempotency.service.js";

describe("CategoryRuleRepository", () => {
  let replicaSet: MongoMemoryReplSet | undefined;
  let connection: Connection | undefined;
  let rules: CategoryRuleRepository | undefined;
  let mutations: CategoryRuleMutationService | undefined;
  let categoryId: string | undefined;

  beforeAll(async () => {
    replicaSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    connection = await createConnection(replicaSet.getUri("vyaya_category_rules_test")).asPromise();
    rules = new CategoryRuleRepository(connection);
    const categories = new CategoryRepository(connection);
    mutations = new CategoryRuleMutationService(
      connection,
      rules,
      categories,
      new IdempotencyService(new IdempotencyRepository(connection))
    );
    categoryId = (await categories.create("user-mutation", { name: "Food", kind: "expense" })).id;
    await connectedDatabase(connection)
      .collection("idempotency_records")
      .createIndex({ userId: 1, operation: 1, key: 1 }, { unique: true });
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

  it("creates and deletes one rule across five identical mutation attempts", async () => {
    const service = mutationService(mutations);
    const category = existingId(categoryId);
    const creates = await Promise.all(
      Array.from({ length: 5 }, () =>
        service.create(
          "user-mutation",
          { pattern: "SWIGGY INSTAMART", categoryId: category },
          "55555555-aaaa-4555-8555-555555555555"
        )
      )
    );

    expect(creates.filter((result) => !result.replayed)).toHaveLength(1);
    const ruleId = creates[0]?.result.id;
    if (ruleId === undefined) throw new Error("Expected a created category rule");
    expect(
      await connectedDatabase(connection)
        .collection("category_rules")
        .countDocuments({ userId: "user-mutation", pattern: "SWIGGY INSTAMART" })
    ).toBe(1);

    const deletions = await Promise.all(
      Array.from({ length: 5 }, () =>
        service.delete("user-mutation", ruleId, "66666666-aaaa-4666-8666-666666666666")
      )
    );
    expect(deletions.filter((result) => !result.replayed)).toHaveLength(1);
    expect(
      await connectedDatabase(connection)
        .collection("category_rules")
        .countDocuments({ userId: "user-mutation", pattern: "SWIGGY INSTAMART" })
    ).toBe(0);
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

function mutationService(
  service: CategoryRuleMutationService | undefined
): CategoryRuleMutationService {
  if (service === undefined) throw new Error("Category rule mutation service is not ready");
  return service;
}

function existingId(value: string | undefined): string {
  if (value === undefined) throw new Error("Fixture id is not ready");
  return value;
}

function connectedDatabase(connection: Connection | undefined): NonNullable<Connection["db"]> {
  if (connection === undefined) throw new Error("MongoDB connection is not ready");
  const database = connection.db;
  if (database === undefined) throw new Error("MongoDB database is not ready");
  return database;
}
