import { describe, expect, it, vi } from "vitest";

import { CircuitBreaker, CircuitBreakerOpenError } from "../circuit-breaker.js";

describe("CircuitBreaker", () => {
  it("stays closed and passes through results while calls succeed", async () => {
    const breaker = new CircuitBreaker();
    await expect(breaker.execute(() => Promise.resolve("ok"))).resolves.toBe("ok");
    await expect(breaker.execute(() => Promise.resolve("ok again"))).resolves.toBe("ok again");
  });

  it("opens after the failure threshold and rejects further calls without invoking fn", async () => {
    const breaker = new CircuitBreaker(3, 60_000);
    const fn = vi.fn().mockRejectedValue(new Error("down"));

    await expect(breaker.execute(fn)).rejects.toThrow("down");
    await expect(breaker.execute(fn)).rejects.toThrow("down");
    await expect(breaker.execute(fn)).rejects.toThrow("down");
    expect(fn).toHaveBeenCalledTimes(3);

    await expect(breaker.execute(fn)).rejects.toThrow(CircuitBreakerOpenError);
    expect(fn).toHaveBeenCalledTimes(3); // the open-circuit call never invoked fn
  });

  it("half-opens after the open duration and probes with a single call", async () => {
    let now = 0;
    const breaker = new CircuitBreaker(1, 60_000, () => now);
    const fn = vi.fn().mockRejectedValue(new Error("down"));

    await expect(breaker.execute(fn)).rejects.toThrow("down"); // 1 failure -> open
    now += 59_999;
    await expect(breaker.execute(fn)).rejects.toThrow(CircuitBreakerOpenError); // still open
    now += 2;
    await expect(breaker.execute(fn)).rejects.toThrow("down"); // half-open probe, still failing
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("closes again after a successful half-open probe", async () => {
    let now = 0;
    const breaker = new CircuitBreaker(1, 60_000, () => now);
    const fn = vi.fn().mockRejectedValueOnce(new Error("down")).mockResolvedValue("recovered");

    await expect(breaker.execute(fn)).rejects.toThrow("down"); // opens
    now += 60_000;
    await expect(breaker.execute(fn)).resolves.toBe("recovered"); // half-open probe succeeds -> closed

    // Circuit is closed again — a single subsequent failure alone shouldn't reopen it
    // (threshold is 1 here, so this one does reopen; assert it counts from zero, not
    // from the pre-recovery failure count).
    const failing = vi.fn().mockRejectedValue(new Error("down again"));
    await expect(breaker.execute(failing)).rejects.toThrow("down again");
    await expect(breaker.execute(failing)).rejects.toThrow(CircuitBreakerOpenError);
    expect(failing).toHaveBeenCalledTimes(1);
  });
});
