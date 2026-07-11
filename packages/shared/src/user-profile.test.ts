import { describe, expect, it } from "vitest";

import {
  DEFAULT_USER_PROFILE,
  UserProfileSchema,
  UserProfileUpdateSchema
} from "./user-profile.js";

describe("UserProfileSchema", () => {
  it("accepts the fixed India locale and timezone defaults", () => {
    const now = new Date("2026-07-11T00:00:00.000Z");

    expect(
      UserProfileSchema.parse({
        userId: "user-1",
        displayName: "Harsh",
        ...DEFAULT_USER_PROFILE,
        createdAt: now,
        updatedAt: now
      })
    ).toMatchObject({ userId: "user-1", displayName: "Harsh", ...DEFAULT_USER_PROFILE });
  });

  it("rejects profile updates that change tenancy defaults", () => {
    expect(() => UserProfileUpdateSchema.parse({ timezone: "UTC" })).toThrow();
  });
});
