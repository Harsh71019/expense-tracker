import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import { createConnection } from "mongoose";
import type { Connection } from "mongoose";

import { UserProfileRepository } from "../../../src/user-profiles/user-profile.repository.js";

describe("UserProfileRepository tenancy", () => {
  let replicaSet: MongoMemoryReplSet | undefined;
  let connection: Connection | undefined;
  let profiles: UserProfileRepository | undefined;

  beforeAll(async () => {
    replicaSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    connection = await createConnection(replicaSet.getUri("vyaya_test")).asPromise();
    profiles = new UserProfileRepository(connection);
  });

  afterAll(async () => {
    if (connection !== undefined) {
      await connection.close();
    }
    if (replicaSet !== undefined) {
      await replicaSet.stop();
    }
  });

  it("never reads or mutates another user's profile", async () => {
    const repository = profileRepository(profiles);
    await repository.ensure("user-a", "Asha");
    await repository.ensure("user-b", "Bharat");

    const aProfile = await repository.findByUserId("user-a");
    const bProfile = await repository.findByUserId("user-b");

    expect(aProfile).toMatchObject({ userId: "user-a", displayName: "Asha" });
    expect(bProfile).toMatchObject({ userId: "user-b", displayName: "Bharat" });

    await repository.update("user-a", { displayName: "Asha Mehta" });

    expect(await repository.findByUserId("user-a")).toMatchObject({ displayName: "Asha Mehta" });
    expect(await repository.findByUserId("user-b")).toMatchObject({ displayName: "Bharat" });
  });

  it("creates user profile directly", async () => {
    const repository = profileRepository(profiles);
    const profile = await repository.create("user-c", "Chitra");
    expect(profile).toMatchObject({
      userId: "user-c",
      displayName: "Chitra",
      locale: "en-IN",
      timezone: "Asia/Kolkata"
    });

    const found = await repository.findByUserId("user-c");
    expect(found).toMatchObject({
      userId: "user-c",
      displayName: "Chitra",
      locale: "en-IN",
      timezone: "Asia/Kolkata"
    });
  });

  it("returns null when updating non-existent profile", async () => {
    const repository = profileRepository(profiles);
    const updated = await repository.update("non-existent-user", { displayName: "Ghost" });
    expect(updated).toBeNull();
  });
});

function profileRepository(repository: UserProfileRepository | undefined): UserProfileRepository {
  if (repository === undefined) {
    throw new Error("User profile repository is not ready");
  }

  return repository;
}
