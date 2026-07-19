import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { EntityNotFoundError } from "../../../src/common/errors/entity-not-found.error.js";
import { UserProfileRepository } from "../../../src/user-profiles/user-profile.repository.js";
import { UserProfileService } from "../../../src/user-profiles/user-profile.service.js";
import { createTestDb, insertTestUser } from "../support/postgres-test-db.js";
import type { TestDb } from "../support/postgres-test-db.js";

describe("UserProfileService", () => {
  let testDb: TestDb;
  let userProfileService: UserProfileService;

  beforeAll(async () => {
    testDb = await createTestDb();
    const repository = new UserProfileRepository(testDb.db);
    userProfileService = new UserProfileService(repository);
    await insertTestUser(testDb.db, "user-1");
  }, 60_000);

  afterAll(async () => {
    await testDb.teardown();
  });

  it("ensures and retrieves a user profile correctly", async () => {
    const profile = await userProfileService.ensure("user-1", "Harsh");
    expect(profile).toMatchObject({
      userId: "user-1",
      displayName: "Harsh",
      locale: "en-IN",
      timezone: "Asia/Kolkata"
    });

    const retrieved = await userProfileService.get("user-1");
    expect(retrieved).toEqual(profile);
  });

  it("throws EntityNotFoundError if the profile does not exist", async () => {
    await expect(userProfileService.get("non-existent-user")).rejects.toThrow(EntityNotFoundError);
  });
});
