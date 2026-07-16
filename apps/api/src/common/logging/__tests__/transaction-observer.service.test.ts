import { describe, expect, it, vi } from "vitest";
import {
  TransactionObserverService,
  transactionObserver
} from "../transaction-observer.service.js";

describe("TransactionObserverService", () => {
  it("sets the global transactionObserver and triggers logging events", () => {
    const mockLogger = {
      debug: vi.fn(),
      warn: vi.fn(),
      error: vi.fn()
    };

    const mockContext = {
      get: vi.fn().mockReturnValue({ reqId: "req-1" })
    };

    // @ts-expect-error - mock dependencies for unit testing
    new TransactionObserverService(mockLogger, mockContext);

    // Verify getter returns the instantiated observer wrapper
    const active = transactionObserver();
    expect(active).toBeDefined();

    if (active) {
      // Test started event
      active.started();
      expect(mockLogger.debug).toHaveBeenCalledWith(
        { event: "txn.started", reqId: "req-1" },
        "transaction started"
      );

      // Test retried event
      active.retried(2);
      expect(mockLogger.warn).toHaveBeenCalledWith(
        { event: "txn.retry", attempt: 2, reqId: "req-1" },
        "transaction retrying"
      );

      // Test completed event (< 500ms)
      active.completed(120);
      expect(mockLogger.debug).toHaveBeenCalledWith(
        { event: "txn.committed", durationMs: 120, reqId: "req-1" },
        "transaction completed"
      );

      // Test slow completed event (> 500ms)
      active.completed(650);
      expect(mockLogger.warn).toHaveBeenCalledWith(
        { event: "txn.slow", durationMs: 650, reqId: "req-1" },
        "slow transaction"
      );

      // Test failed event
      const testError = new Error("Conflict");
      active.failed(testError, 80);
      expect(mockLogger.error).toHaveBeenCalledWith(
        { event: "txn.failed", err: testError, durationMs: 80, reqId: "req-1" },
        "transaction failed"
      );
    }
  });
});
