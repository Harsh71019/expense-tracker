import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { UserProfileRepository } from "../../../src/user-profiles/user-profile.repository.js";
import { createTestDb, insertTestUser } from "../support/postgres-test-db.js";
import type { TestDb } from "../support/postgres-test-db.js";

describe("UserProfileRepository tenancy", () => {
  let testDb: TestDb;
  let profiles: UserProfileRepository;

  beforeAll(async () => {
    testDb = await createTestDb();
    profiles = new UserProfileRepository(testDb.db);
    await insertTestUser(testDb.db, "user-a");
    await insertTestUser(testDb.db, "user-b");
    await insertTestUser(testDb.db, "user-c");
  }, 60_000);

  afterAll(async () => {
    await testDb.teardown();
  });

  it("never reads or mutates another user's profile", async () => {
    await profiles.ensure("user-a", "Asha");
    await profiles.ensure("user-b", "Bharat");

    const aProfile = await profiles.findByUserId("user-a");
    const bProfile = await profiles.findByUserId("user-b");

    expect(aProfile).toMatchObject({ userId: "user-a", displayName: "Asha" });
    expect(bProfile).toMatchObject({ userId: "user-b", displayName: "Bharat" });

    await profiles.update("user-a", { displayName: "Asha Mehta" });

    expect(await profiles.findByUserId("user-a")).toMatchObject({ displayName: "Asha Mehta" });
    expect(await profiles.findByUserId("user-b")).toMatchObject({ displayName: "Bharat" });
  });

  it("creates user profile directly", async () => {
    const profile = await profiles.create("user-c", "Chitra");
    expect(profile).toMatchObject({
      userId: "user-c",
      displayName: "Chitra",
      locale: "en-IN",
      timezone: "Asia/Kolkata"
    });

    const found = await profiles.findByUserId("user-c");
    expect(found).toMatchObject({
      userId: "user-c",
      displayName: "Chitra",
      locale: "en-IN",
      timezone: "Asia/Kolkata"
    });
  });

  it("returns null when updating non-existent profile", async () => {
    const updated = await profiles.update("non-existent-user", { displayName: "Ghost" });
    expect(updated).toBeNull();
  });
});
