type CircuitState = "closed" | "open" | "half_open";

export class CircuitBreakerOpenError extends Error {
  constructor() {
    super("Circuit breaker is open — outbound notification calls are paused.");
  }
}

/**
 * BACKEND.md §14: "Circuit breaker on outbound calls (ntfy/Telegram): 5
 * failures -> open 60s -> half-open probe. A down notification service
 * must never back-pressure the ledger." Pure, dependency-free, and
 * per-instance state (one breaker per adapter, not shared across unrelated
 * outbound calls) — the caller owns the instance's lifetime.
 */
export class CircuitBreaker {
  private state: CircuitState = "closed";
  private consecutiveFailures = 0;
  private openedAt: number | null = null;

  constructor(
    private readonly failureThreshold = 5,
    private readonly openDurationMs = 60_000,
    private readonly now: () => number = Date.now
  ) {}

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === "open") {
      if (this.openedAt !== null && this.now() - this.openedAt >= this.openDurationMs) {
        this.state = "half_open";
      } else {
        throw new CircuitBreakerOpenError();
      }
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  private onSuccess(): void {
    this.consecutiveFailures = 0;
    this.state = "closed";
    this.openedAt = null;
  }

  private onFailure(): void {
    this.consecutiveFailures += 1;
    if (this.state === "half_open" || this.consecutiveFailures >= this.failureThreshold) {
      this.state = "open";
      this.openedAt = this.now();
    }
  }
}
