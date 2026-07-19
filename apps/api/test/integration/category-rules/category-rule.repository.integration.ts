import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";

import { CategoryRuleRepository } from "../../../src/category-rules/category-rule.repository.js";
import { CategoryRuleMutationService } from "../../../src/category-rules/category-rule-mutation.service.js";
import { CategoryRepository } from "../../../src/categories/category.repository.js";
import { categoryRules } from "../../../src/common/db/schema/index.js";
import { IdempotencyPostgresRepository } from "../../../src/common/idempotency/idempotency-postgres.repository.js";
import { IdempotencyPostgresService } from "../../../src/common/idempotency/idempotency-postgres.service.js";
import { createTestDb, insertTestUser } from "../support/postgres-test-db.js";
import type { TestDb } from "../support/postgres-test-db.js";

describe("CategoryRuleRepository", () => {
  let testDb: TestDb;
  let rules: CategoryRuleRepository;
  let mutations: CategoryRuleMutationService;
  let categoryId: string;
  let mutationCategoryId: string;

  beforeAll(async () => {
    testDb = await createTestDb();
    for (const userId of ["user-a", "user-b", "user-delete", "user-mutation"]) {
      await insertTestUser(testDb.db, userId);
    }

    const categories = new CategoryRepository(testDb.db);
    rules = new CategoryRuleRepository(testDb.db);
    mutations = new CategoryRuleMutationService(
      rules,
      categories,
      new IdempotencyPostgresService(testDb.db, new IdempotencyPostgresRepository(testDb.db))
    );

    categoryId = (await categories.create("user-a", { name: "Food", kind: "expense" })).id;
    mutationCategoryId = (
      await categories.create("user-mutation", { name: "Food", kind: "expense" })
    ).id;
  }, 60_000);

  afterAll(async () => {
    await testDb.teardown();
  });

  it("creates and lists rules scoped to the user, sorted by pattern", async () => {
    await rules.create("user-a", { pattern: "SWIGGY", categoryId });
    await rules.create("user-a", { pattern: "IRCTC", categoryId });
    await rules.create("user-b", { pattern: "ZOMATO", categoryId });

    const userARules = await rules.list("user-a");
    expect(userARules.map((rule) => rule.pattern)).toEqual(["IRCTC", "SWIGGY"]);
    expect(await rules.list("user-b")).toHaveLength(1);
  });

  it("deletes a rule only when it belongs to the requesting user", async () => {
    const rule = await rules.create("user-delete", { pattern: "AMAZON", categoryId });

    expect(await rules.delete("someone-else", rule.id)).toBe(false);
    expect(await rules.delete("user-delete", rule.id)).toBe(true);
    expect(await rules.list("user-delete")).toEqual([]);
  });

  it("creates and deletes one rule across five identical mutation attempts", async () => {
    const creates = await Promise.all(
      Array.from({ length: 5 }, () =>
        mutations.create(
          "user-mutation",
          { pattern: "SWIGGY INSTAMART", categoryId: mutationCategoryId },
          "55555555-aaaa-4555-8555-555555555555"
        )
      )
    );

    expect(creates.filter((result) => !result.replayed)).toHaveLength(1);
    const ruleId = creates[0]?.result.id;
    if (ruleId === undefined) throw new Error("Expected a created category rule");
    expect(
      await testDb.db
        .select()
        .from(categoryRules)
        .where(
          and(
            eq(categoryRules.userId, "user-mutation"),
            eq(categoryRules.pattern, "SWIGGY INSTAMART")
          )
        )
    ).toHaveLength(1);

    const deletions = await Promise.all(
      Array.from({ length: 5 }, () =>
        mutations.delete("user-mutation", ruleId, "66666666-aaaa-4666-8666-666666666666")
      )
    );
    expect(deletions.filter((result) => !result.replayed)).toHaveLength(1);
    expect(
      await testDb.db
        .select()
        .from(categoryRules)
        .where(
          and(
            eq(categoryRules.userId, "user-mutation"),
            eq(categoryRules.pattern, "SWIGGY INSTAMART")
          )
        )
    ).toHaveLength(0);
  });
});
