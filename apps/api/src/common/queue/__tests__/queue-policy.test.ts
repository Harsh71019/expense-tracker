import { describe, expect, it } from "vitest";

import { isTerminalJobFailure, QUEUE_RETENTION } from "../queue-policy.js";

describe("queue policy", () => {
  it("bounds completed and failed Redis history by age and count", () => {
    expect(QUEUE_RETENTION.removeOnComplete).toEqual({ age: 86_400, count: 1_000 });
    expect(QUEUE_RETENTION.removeOnFail).toEqual({ age: 604_800, count: 5_000 });
  });

  it("distinguishes retryable attempt failures from terminal exhaustion", () => {
    expect(isTerminalJobFailure({ attemptsMade: 2, opts: { attempts: 3 } })).toBe(false);
    expect(isTerminalJobFailure({ attemptsMade: 3, opts: { attempts: 3 } })).toBe(true);
    expect(isTerminalJobFailure({ attemptsMade: 1, opts: {} })).toBe(true);
  });
});
