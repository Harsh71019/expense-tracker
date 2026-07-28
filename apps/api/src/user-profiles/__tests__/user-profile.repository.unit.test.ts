import { describe, expect, it } from "vitest";

import { createMockDrizzleDb } from "../../test/mock-drizzle.js";
import { UserProfileRepository } from "../user-profile.repository.js";

describe("UserProfileRepository Unit Tests", () => {
  const sampleProfileRow = {
    userId: "u1",
    displayName: "Harsh",
    currency: "INR",
    locale: "en-IN",
    timezone: "Asia/Kolkata",
    createdAt: new Date(),
    updatedAt: new Date()
  };

  it("findByUserId returns profile or null", async () => {
    const mockDb = createMockDrizzleDb([sampleProfileRow]);
    const repo = new UserProfileRepository(mockDb);

    const res = await repo.findByUserId("u1");
    expect(res?.displayName).toBe("Harsh");
  });

  it("create inserts new profile", async () => {
    const mockDb = createMockDrizzleDb([sampleProfileRow]);
    const repo = new UserProfileRepository(mockDb);

    const res = await repo.create("u1", "Harsh");
    expect(res.displayName).toBe("Harsh");
  });

  it("ensure inserts or finds existing profile", async () => {
    const mockDb = createMockDrizzleDb([sampleProfileRow]);
    const repo = new UserProfileRepository(mockDb);

    const res = await repo.ensure("u1", "Harsh");
    expect(res.displayName).toBe("Harsh");
  });

  it("update patches profile fields", async () => {
    const mockDb = createMockDrizzleDb([sampleProfileRow]);
    const repo = new UserProfileRepository(mockDb);

    const res = await repo.update("u1", { displayName: "Harsh Updated" });
    expect(res?.displayName).toBe("Harsh");
  });
});
