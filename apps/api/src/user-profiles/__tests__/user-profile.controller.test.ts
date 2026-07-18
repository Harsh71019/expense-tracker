import { describe, expect, it, vi } from "vitest";
import { UserProfileController } from "../user-profile.controller.js";
import type { AuthenticatedUser } from "../../auth/auth.guard.js";
import { EntityNotFoundError } from "../../common/errors/entity-not-found.error.js";

describe("UserProfileController", () => {
  const user: AuthenticatedUser = { id: "user-1" };

  it("calls get on the profiles service and returns user profile", async () => {
    const mockProfile = {
      userId: "user-1",
      displayName: "Harsh",
      locale: "en-IN" as const,
      timezone: "Asia/Kolkata" as const,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    const mockService = {
      ensure: vi.fn(),
      get: vi.fn().mockResolvedValue(mockProfile)
    };

    // @ts-expect-error - mock UserProfileService for unit testing
    const controller = new UserProfileController(mockService);
    const result = await controller.get(user);

    expect(result).toEqual(mockProfile);
    expect(mockService.get).toHaveBeenCalledWith("user-1");
  });

  it("preserves the not-found result for a missing profile", async () => {
    const mockService = {
      get: vi.fn().mockRejectedValue(new EntityNotFoundError("User profile"))
    };
    // @ts-expect-error - mock UserProfileService for unit testing
    const controller = new UserProfileController(mockService);

    await expect(controller.get(user)).rejects.toThrow("User profile not found.");
  });
});
