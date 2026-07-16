import { describe, expect, it } from "vitest";
import { LoggingContextService } from "../logging-context.service.js";

describe("LoggingContextService", () => {
  it("stores and retrieves log context scope variables within run block", () => {
    const service = new LoggingContextService();

    expect(service.get()).toBeUndefined();

    const mockContext = { reqId: "req-123", userId: "user-abc" };
    const result = service.run(mockContext, () => {
      expect(service.get()).toEqual(mockContext);
      return "done";
    });

    expect(result).toBe("done");
    expect(service.get()).toBeUndefined();
  });

  it("updates and merges scope variables inside the execution block", () => {
    const service = new LoggingContextService();

    // Calling set outside a run block should be a safe no-op
    service.set({ traceId: "t-1" });
    expect(service.get()).toBeUndefined();

    const mockContext = { reqId: "req-123" };
    service.run(mockContext, () => {
      expect(service.get()).toEqual({ reqId: "req-123" });

      service.set({ userId: "user-999" });
      expect(service.get()).toEqual({ reqId: "req-123", userId: "user-999" });

      service.set({ traceId: "trace-xyz" });
      expect(service.get()).toEqual({
        reqId: "req-123",
        userId: "user-999",
        traceId: "trace-xyz"
      });
    });
  });
});
