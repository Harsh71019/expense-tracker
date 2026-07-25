import { describe, expect, it, vi } from "vitest";

import { UserProfileService } from "../user-profile.service.js";
import { EntityNotFoundError } from "../../common/errors/entity-not-found.error.js";

describe("UserProfileService", () => {
  const mockProfile = {
    userId: "user-1",
    displayName: "Harsh",
    locale: "en-IN" as const,
    timezone: "Asia/Kolkata" as const,
    createdAt: new Date(),
    updatedAt: new Date()
  };

  describe("get", () => {
    it("returns the profile when found", async () => {
      const mockRepository = { findByUserId: vi.fn().mockResolvedValue(mockProfile) };
      // @ts-expect-error - mock UserProfileRepository for unit testing
      const service = new UserProfileService(mockRepository);

      const result = await service.get("user-1");

      expect(result).toEqual(mockProfile);
      expect(mockRepository.findByUserId).toHaveBeenCalledWith("user-1");
    });

    it("throws EntityNotFoundError when the profile is missing", async () => {
      const mockRepository = { findByUserId: vi.fn().mockResolvedValue(null) };
      // @ts-expect-error - mock UserProfileRepository for unit testing
      const service = new UserProfileService(mockRepository);

      await expect(service.get("user-1")).rejects.toThrow(EntityNotFoundError);
    });
  });

  describe("update", () => {
    it("returns the updated profile", async () => {
      const updated = { ...mockProfile, displayName: "New Name" };
      const mockRepository = { update: vi.fn().mockResolvedValue(updated) };
      // @ts-expect-error - mock UserProfileRepository for unit testing
      const service = new UserProfileService(mockRepository);

      const result = await service.update("user-1", { displayName: "New Name" });

      expect(result).toEqual(updated);
      expect(mockRepository.update).toHaveBeenCalledWith("user-1", { displayName: "New Name" });
    });

    it("throws EntityNotFoundError when no profile matched the update", async () => {
      const mockRepository = { update: vi.fn().mockResolvedValue(null) };
      // @ts-expect-error - mock UserProfileRepository for unit testing
      const service = new UserProfileService(mockRepository);

      await expect(service.update("user-1", { displayName: "New Name" })).rejects.toThrow(
        EntityNotFoundError
      );
    });
  });
});
