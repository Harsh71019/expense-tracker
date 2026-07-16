import { describe, expect, it, vi } from "vitest";
import { RequestContextMiddleware } from "../request-context.middleware.js";

describe("RequestContextMiddleware", () => {
  it("reuses existing x-request-id header when present", () => {
    const mockContext = {
      run: vi.fn().mockImplementation((ctx, next) => next())
    };

    // @ts-expect-error - mock LoggingContextService
    const middleware = new RequestContextMiddleware(mockContext);

    const mockRequest = {
      headers: {
        "x-request-id": "client-req-id-789"
      }
    };

    const mockResponse = {
      setHeader: vi.fn()
    };

    const mockNext = vi.fn();

    // @ts-expect-error - mock Express request/response/next
    middleware.use(mockRequest, mockResponse, mockNext);

    expect(mockResponse.setHeader).toHaveBeenCalledWith("x-request-id", "client-req-id-789");
    expect(mockContext.run).toHaveBeenCalledWith({ reqId: "client-req-id-789" }, mockNext);
    expect(mockNext).toHaveBeenCalled();
  });

  it("generates a new crypto randomUUID when header is missing", () => {
    const mockContext = {
      run: vi.fn().mockImplementation((ctx, next) => next())
    };

    // @ts-expect-error - mock LoggingContextService
    const middleware = new RequestContextMiddleware(mockContext);

    const mockRequest = {
      headers: {}
    };

    const mockResponse = {
      setHeader: vi.fn()
    };

    const mockNext = vi.fn();

    // @ts-expect-error - mock Express request/response/next
    middleware.use(mockRequest, mockResponse, mockNext);

    expect(mockResponse.setHeader).toHaveBeenCalledWith("x-request-id", expect.any(String));
    expect(mockContext.run).toHaveBeenCalledWith(
      {
        reqId: expect.stringMatching(
          /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
        )
      },
      mockNext
    );
    expect(mockNext).toHaveBeenCalled();
  });
});
