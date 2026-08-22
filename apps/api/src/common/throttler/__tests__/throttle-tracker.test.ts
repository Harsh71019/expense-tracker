import { describe, expect, it } from "vitest";

import { throttleTracker } from "../throttle-tracker.js";

describe("throttleTracker", () => {
  it("keys authenticated requests by user id", () => {
    expect(throttleTracker({ authUser: { id: "user-1" }, ip: "10.0.0.2" })).toBe("user:user-1");
  });

  it("falls back to client IP when no session is present", () => {
    expect(throttleTracker({ ip: "10.0.0.2" })).toBe("ip:10.0.0.2");
  });

  it("uses a stable unknown bucket when IP is missing", () => {
    expect(throttleTracker({})).toBe("ip:unknown");
  });
});
