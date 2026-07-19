import { describe, expect, it } from "vitest";

import { InsufficientScopeError } from "../insufficient-scope.error.js";

describe("InsufficientScopeError", () => {
  it("is a 403, non-retryable domain error", () => {
    const error = new InsufficientScopeError();
    expect(error.code).toBe("auth.insufficient_scope");
    expect(error.status).toBe(403);
    expect(error.retryable).toBe(false);
    expect(error.headers).toBeUndefined();
  });
});
