import { afterEach, describe, expect, it, vi } from "vitest";

import { DeadlineExceededError, withDeadline } from "../deadline.js";

describe("withDeadline", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns a task result before the deadline", async () => {
    await expect(withDeadline("fast task", 100, Promise.resolve("done"))).resolves.toBe("done");
  });

  it("rejects a task that exceeds the deadline", async () => {
    vi.useFakeTimers();
    const result = withDeadline("slow task", 100, new Promise<never>(() => undefined));
    const assertion = expect(result).rejects.toEqual(new DeadlineExceededError("slow task", 100));

    await vi.advanceTimersByTimeAsync(100);

    await assertion;
  });
});
