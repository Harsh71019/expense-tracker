import { describe, expect, it } from "vitest";

import { RateLimitedError } from "../rate-limited.error.js";

describe("RateLimitedError", () => {
  it("is a 429, retryable domain error carrying a Retry-After header", () => {
    const error = new RateLimitedError(42);
    expect(error.code).toBe("auth.rate_limited");
    expect(error.status).toBe(429);
    expect(error.retryable).toBe(true);
    expect(error.headers).toEqual({ "Retry-After": "42" });
  });
});
