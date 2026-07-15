import {
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException
} from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { EntityNotFoundError } from "../entity-not-found.error.js";
import { TransactionNotReversibleError } from "../transaction-not-reversible.error.js";
import { ProblemJsonFilter } from "../problem-json.filter.js";

function mockHost(reqId: string) {
  const response = {
    getHeader: vi.fn().mockReturnValue(reqId),
    status: vi.fn(),
    type: vi.fn(),
    send: vi.fn()
  };
  response.status.mockReturnValue(response);
  response.type.mockReturnValue(response);
  const request = { originalUrl: "/api/v1/transactions" };

  const host = {
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => response
    })
  };
  return { host, response };
}

describe("ProblemJsonFilter", () => {
  const logger = { error: vi.fn() };

  it("maps a ZodError to 422 with field pointers", () => {
    // @ts-expect-error - mock Logger for unit testing
    const filter = new ProblemJsonFilter(logger);
    const { host, response } = mockHost("req-1");
    const result = z.object({ amountMinor: z.number().min(1) }).safeParse({ amountMinor: 0 });
    if (result.success) throw new Error("expected validation failure");

    // @ts-expect-error - mock ArgumentsHost for unit testing
    filter.catch(result.error, host);

    expect(response.status).toHaveBeenCalledWith(422);
    const body = response.send.mock.calls[0]?.[0];
    expect(body).toMatchObject({ code: "common.validation_failed", reqId: "req-1" });
    expect(body.errors).toEqual([
      { path: "amountMinor", code: expect.any(String), message: expect.any(String) }
    ]);
  });

  it("maps a DomainError to its own status, code, and retryable flag", () => {
    // @ts-expect-error - mock Logger for unit testing
    const filter = new ProblemJsonFilter(logger);
    const { host, response } = mockHost("req-2");

    // @ts-expect-error - mock ArgumentsHost for unit testing
    filter.catch(new EntityNotFoundError("Account"), host);

    expect(response.status).toHaveBeenCalledWith(404);
    expect(response.send.mock.calls[0]?.[0]).toMatchObject({
      code: "common.not_found",
      retryable: false,
      reqId: "req-2"
    });
  });

  it("maps TransactionNotReversibleError to 409 with txn.already_reversed", () => {
    // @ts-expect-error - mock Logger for unit testing
    const filter = new ProblemJsonFilter(logger);
    const { host, response } = mockHost("req-3");

    // @ts-expect-error - mock ArgumentsHost for unit testing
    filter.catch(new TransactionNotReversibleError(), host);

    expect(response.status).toHaveBeenCalledWith(409);
    expect(response.send.mock.calls[0]?.[0]).toMatchObject({ code: "txn.already_reversed" });
  });

  it("maps a 401 HttpException to auth.unauthenticated", () => {
    // @ts-expect-error - mock Logger for unit testing
    const filter = new ProblemJsonFilter(logger);
    const { host, response } = mockHost("req-4");

    // @ts-expect-error - mock ArgumentsHost for unit testing
    filter.catch(new UnauthorizedException(), host);

    expect(response.status).toHaveBeenCalledWith(401);
    expect(response.send.mock.calls[0]?.[0]).toMatchObject({
      code: "auth.unauthenticated",
      retryable: false
    });
  });

  it("maps a 404 HttpException to common.not_found", () => {
    // @ts-expect-error - mock Logger for unit testing
    const filter = new ProblemJsonFilter(logger);
    const { host, response } = mockHost("req-5");

    // @ts-expect-error - mock ArgumentsHost for unit testing
    filter.catch(new NotFoundException("Category not found"), host);

    expect(response.status).toHaveBeenCalledWith(404);
    expect(response.send.mock.calls[0]?.[0]).toMatchObject({ code: "common.not_found" });
  });

  it("marks 503 HttpExceptions as retryable dependency_unavailable", () => {
    // @ts-expect-error - mock Logger for unit testing
    const filter = new ProblemJsonFilter(logger);
    const { host, response } = mockHost("req-6");

    // @ts-expect-error - mock ArgumentsHost for unit testing
    filter.catch(new ServiceUnavailableException("Mongo down"), host);

    expect(response.status).toHaveBeenCalledWith(503);
    expect(response.send.mock.calls[0]?.[0]).toMatchObject({
      code: "common.dependency_unavailable",
      retryable: true
    });
  });

  it("falls back to a generic 500 and logs the unexpected error", () => {
    logger.error.mockClear();
    // @ts-expect-error - mock Logger for unit testing
    const filter = new ProblemJsonFilter(logger);
    const { host, response } = mockHost("req-7");

    // @ts-expect-error - mock ArgumentsHost for unit testing
    filter.catch(new Error("boom"), host);

    expect(response.status).toHaveBeenCalledWith(500);
    const body = response.send.mock.calls[0]?.[0];
    expect(body).toMatchObject({ code: "common.internal", retryable: false });
    expect(body.detail).toContain("req-7");
    expect(logger.error).toHaveBeenCalledOnce();
  });
});
