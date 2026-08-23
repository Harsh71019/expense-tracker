import { firstValueFrom, of } from "rxjs";
import { describe, expect, it, vi } from "vitest";

import { ResponseBodyLoggingInterceptor } from "../response-body-logging.interceptor.js";

function buildExecutionContext(url: string) {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ url })
    })
  };
}

function buildCallHandler(body: unknown) {
  return { handle: () => of(body) };
}

describe("ResponseBodyLoggingInterceptor", () => {
  it("captures the response body into the logging context", async () => {
    const context = { set: vi.fn() };
    // @ts-expect-error - mock LoggingContextService
    const interceptor = new ResponseBodyLoggingInterceptor(context);
    const body = { id: "txn_1", amountMinor: 5000 };
    const executionContext = buildExecutionContext("/api/v1/transactions");
    const callHandler = buildCallHandler(body);

    // @ts-expect-error - mock ExecutionContext/CallHandler
    await firstValueFrom(interceptor.intercept(executionContext, callHandler));

    expect(context.set).toHaveBeenCalledWith({ resBody: body });
  });

  it("does not capture when the handler returns undefined", async () => {
    const context = { set: vi.fn() };
    // @ts-expect-error - mock LoggingContextService
    const interceptor = new ResponseBodyLoggingInterceptor(context);
    const executionContext = buildExecutionContext("/api/v1/transactions");
    const callHandler = buildCallHandler(undefined);

    // @ts-expect-error - mock ExecutionContext/CallHandler
    await firstValueFrom(interceptor.intercept(executionContext, callHandler));

    expect(context.set).not.toHaveBeenCalled();
  });

  it("skips capture entirely for auth routes", async () => {
    const context = { set: vi.fn() };
    // @ts-expect-error - mock LoggingContextService
    const interceptor = new ResponseBodyLoggingInterceptor(context);
    const body = { session: { token: "secret-session-token" } };
    const executionContext = buildExecutionContext("/api/v1/auth/session");
    const callHandler = buildCallHandler(body);

    // @ts-expect-error - mock ExecutionContext/CallHandler
    await firstValueFrom(interceptor.intercept(executionContext, callHandler));

    expect(context.set).not.toHaveBeenCalled();
  });

  it("truncates responses larger than the capture limit", async () => {
    let captured: { resBody?: unknown } | undefined;
    const context = {
      set: vi.fn((value: { resBody?: unknown }) => {
        captured = value;
      })
    };
    // @ts-expect-error - mock LoggingContextService
    const interceptor = new ResponseBodyLoggingInterceptor(context);
    const body = {
      items: Array.from({ length: 2000 }, (_, i) => ({ id: i, note: "x".repeat(20) }))
    };
    const executionContext = buildExecutionContext("/api/v1/transactions");
    const callHandler = buildCallHandler(body);

    // @ts-expect-error - mock ExecutionContext/CallHandler
    await firstValueFrom(interceptor.intercept(executionContext, callHandler));

    expect(context.set).toHaveBeenCalledTimes(1);
    expect(typeof captured?.resBody).toBe("string");
    const truncated =
      typeof captured?.resBody === "string" && captured.resBody.endsWith("…[truncated]");
    expect(truncated).toBe(true);
  });
});
