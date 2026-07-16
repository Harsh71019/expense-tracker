import { describe, expect, it } from "vitest";
import { AuthController } from "../auth.controller.js";
import type { AuthenticatedUser } from "../auth.guard.js";

describe("AuthController", () => {
  it("returns current authenticated user details from me endpoint", () => {
    const controller = new AuthController();
    const user: AuthenticatedUser = { id: "user-1" };

    const result = controller.me(user);
    expect(result).toEqual({ id: "user-1" });
  });
});
