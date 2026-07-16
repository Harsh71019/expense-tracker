import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import { createConnection } from "mongoose";
import type { Connection } from "mongoose";
import { EntityNotFoundError } from "../../../src/common/errors/entity-not-found.error.js";
import { UserProfileRepository } from "../../../src/user-profiles/user-profile.repository.js";
import { UserProfileService } from "../../../src/user-profiles/user-profile.service.js";

describe("UserProfileService", () => {
  let replicaSet: MongoMemoryReplSet | undefined;
  let connection: Connection | undefined;
  let userProfileService: UserProfileService | undefined;

  beforeAll(async () => {
    replicaSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    connection = await createConnection(
      replicaSet.getUri("vyaya_user_profile_service_test")
    ).asPromise();
    const repository = new UserProfileRepository(connection);
    userProfileService = new UserProfileService(repository);
  });

  afterAll(async () => {
    if (connection !== undefined) await connection.close();
    if (replicaSet !== undefined) await replicaSet.stop();
  });

  it("ensures and retrieves a user profile correctly", async () => {
    const service = getUserProfileService(userProfileService);

    const profile = await service.ensure("user-1", "Harsh");
    expect(profile).toMatchObject({
      userId: "user-1",
      displayName: "Harsh",
      locale: "en-IN",
      timezone: "Asia/Kolkata"
    });

    const retrieved = await service.get("user-1");
    expect(retrieved).toEqual(profile);
  });

  it("throws EntityNotFoundError if the profile does not exist", async () => {
    const service = getUserProfileService(userProfileService);

    await expect(service.get("non-existent-user")).rejects.toThrow(EntityNotFoundError);
  });
});

function getUserProfileService(service: UserProfileService | undefined): UserProfileService {
  if (service === undefined) throw new Error("UserProfile service is not ready");
  return service;
}
