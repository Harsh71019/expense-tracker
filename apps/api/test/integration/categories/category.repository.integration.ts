import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { CategoryRepository } from "../../../src/categories/category.repository.js";
import { createTestDb, insertTestUser } from "../support/postgres-test-db.js";
import type { TestDb } from "../support/postgres-test-db.js";

describe("CategoryRepository tenancy and archive behavior", () => {
  let testDb: TestDb;
  let categories: CategoryRepository;

  beforeAll(async () => {
    testDb = await createTestDb();
    categories = new CategoryRepository(testDb.db);
    await insertTestUser(testDb.db, "user-a");
    await insertTestUser(testDb.db, "user-b");
  }, 60_000);

  afterAll(async () => {
    await testDb.teardown();
  });

  it("scopes category access to the authenticated user", async () => {
    const aCategory = await categories.create("user-a", { name: "Food", kind: "expense" });
    const bCategory = await categories.create("user-b", { name: "Food", kind: "expense" });

    expect(await categories.list("user-a")).toMatchObject([{ id: aCategory.id, userId: "user-a" }]);
    expect(await categories.list("user-b")).toMatchObject([{ id: bCategory.id, userId: "user-b" }]);
    expect(await categories.archive("user-a", bCategory.id)).toBe(false);
    expect(await categories.archive("user-a", aCategory.id)).toBe(true);
    expect(await categories.list("user-a")).toEqual([]);
  });

  it("verifies category existence checks (exists method)", async () => {
    const cat = await categories.create("user-a", { name: "Snacks", kind: "expense" });

    expect(await categories.exists("user-a", cat.id)).toBe(true);
    expect(await categories.exists("user-a", "3fa85f64-5717-4562-b3fc-2c963f66afa6")).toBe(false);
    expect(await categories.exists("user-b", cat.id)).toBe(false);

    await categories.archive("user-a", cat.id);
    expect(await categories.exists("user-a", cat.id)).toBe(false);
  });
});
