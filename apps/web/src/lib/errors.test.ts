import { describe, expect, it } from "vitest";

import { AppError, AuthError, ConflictError, NetworkError, ValidationError } from "./errors";

describe("AppError taxonomy", () => {
  it.each([
    [AuthError, "AuthError"],
    [ConflictError, "ConflictError"],
    [NetworkError, "NetworkError"],
    [ValidationError, "ValidationError"]
  ])("preserves context for %s", (ErrorType, expectedName) => {
    const context = { reqId: "req-123", status: 409, problemType: "duplicate" };
    const error = new ErrorType("Request failed", context);

    expect(error).toBeInstanceOf(AppError);
    expect(error.name).toBe(expectedName);
    expect(error.message).toBe("Request failed");
    expect(error.context).toEqual(context);
  });
});
