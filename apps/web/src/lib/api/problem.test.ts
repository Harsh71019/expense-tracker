import { describe, expect, it } from "vitest";

import { AppError, AuthError, ConflictError, NetworkError, ValidationError } from "../errors";
import { toAppError, toNetworkError } from "./problem";

const problem = (
  code:
    "auth.unauthenticated" | "common.validation_failed" | "txn.already_reversed" | "common.internal"
) => ({
  type: `https://treasury-ops.app/problems/${code}`,
  title: "Problem",
  status: 422,
  detail: "Request failed",
  instance: "/api/v1/transactions",
  code,
  reqId: "request-1",
  timestamp: "2026-07-16T00:00:00.000Z",
  retryable: false,
  errors: [{ path: "amountMinor", code: "too_small", message: "Too small" }]
});

describe("API problem mapping", () => {
  it("maps typed problem responses to the application taxonomy", () => {
    expect(toAppError(problem("auth.unauthenticated"), 401)).toBeInstanceOf(AuthError);
    expect(toAppError(problem("txn.already_reversed"), 409)).toBeInstanceOf(ConflictError);
    expect(toAppError(problem("common.internal"), 500)).toBeInstanceOf(NetworkError);
    expect(toAppError(problem("common.internal"), 400)).toBeInstanceOf(AppError);
  });

  it("retains field errors for validation and safely handles unknown problem bodies", () => {
    const validation = toAppError(problem("common.validation_failed"), 422);
    expect(validation).toBeInstanceOf(ValidationError);
    if (validation instanceof ValidationError) {
      expect(validation.fields).toEqual([expect.objectContaining({ path: "amountMinor" })]);
    }
    expect(toAppError({ invalid: true }, 422).message).toBe("The request could not be completed.");
    expect(toNetworkError(new TypeError("offline"))).toMatchObject({ message: "offline" });
    expect(toNetworkError(null)).toMatchObject({ message: "The network request failed." });
  });
});
