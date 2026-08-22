import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  PayloadTooLargeException,
  ServiceUnavailableException,
  UnauthorizedException
} from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { EntityNotFoundError } from "../entity-not-found.error.js";
import { RateLimitedError } from "../rate-limited.error.js";
import { TransactionNotReversibleError } from "../transaction-not-reversible.error.js";
import { ProblemJsonFilter } from "../problem-json.filter.js";

function mockHost(reqId: string) {
  const response = {
    getHeader: vi.fn().mockReturnValue(reqId),
    status: vi.fn(),
    type: vi.fn(),
    send: vi.fn(),
    set: vi.fn()
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
    expect(body).toMatchObject({
      code: "common.validation_failed",
      message: "1 field(s) failed validation.",
      reqId: "req-1"
    });
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
      message: "Account not found.",
      retryable: false,
      reqId: "req-2"
    });
  });

  it("applies headers from a DomainError that carries them", () => {
    // @ts-expect-error - mock Logger for unit testing
    const filter = new ProblemJsonFilter(logger);
    const { host, response } = mockHost("req-8");

    // @ts-expect-error - mock ArgumentsHost for unit testing
    filter.catch(new RateLimitedError(30), host);

    expect(response.set).toHaveBeenCalledWith({ "Retry-After": "30" });
    expect(response.status).toHaveBeenCalledWith(429);
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
    expect(response.send.mock.calls[0]?.[0]).toMatchObject({
      code: "common.not_found",
      message: "Category not found"
    });
  });

  it("maps a 403 HttpException to a clear permission response", () => {
    // @ts-expect-error - mock Logger for unit testing
    const filter = new ProblemJsonFilter(logger);
    const { host, response } = mockHost("req-9");

    // @ts-expect-error - mock ArgumentsHost for unit testing
    filter.catch(new ForbiddenException(), host);

    expect(response.status).toHaveBeenCalledWith(403);
    expect(response.send.mock.calls[0]?.[0]).toMatchObject({
      code: "auth.insufficient_scope",
      message: "You do not have permission to perform this action."
    });
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
    expect(body).toMatchObject({
      code: "common.internal",
      message: "An unexpected error occurred. Reference: req-7.",
      retryable: false
    });
    expect(body.detail).toContain("req-7");
    expect(logger.error).toHaveBeenCalledOnce();
  });

  it("maps Express malformed JSON to 400 common.malformed_request without logging", () => {
    logger.error.mockClear();
    // @ts-expect-error - mock Logger for unit testing
    const filter = new ProblemJsonFilter(logger);
    const { host, response } = mockHost("req-10");
    const error = new SyntaxError("Unexpected token");
    Object.assign(error, { type: "entity.parse.failed", status: 400 });

    // @ts-expect-error - mock ArgumentsHost for unit testing
    filter.catch(error, host);

    expect(response.status).toHaveBeenCalledWith(400);
    expect(response.send.mock.calls[0]?.[0]).toMatchObject({
      code: "common.malformed_request",
      retryable: false,
      reqId: "req-10"
    });
    expect(logger.error).not.toHaveBeenCalled();
  });

  it("maps Express oversized JSON to 413 common.payload_too_large", () => {
    // @ts-expect-error - mock Logger for unit testing
    const filter = new ProblemJsonFilter(logger);
    const { host, response } = mockHost("req-11");
    const error = Object.assign(new Error("too large"), { type: "entity.too.large", status: 413 });

    // @ts-expect-error - mock ArgumentsHost for unit testing
    filter.catch(error, host);

    expect(response.status).toHaveBeenCalledWith(413);
    expect(response.send.mock.calls[0]?.[0]).toMatchObject({
      code: "common.payload_too_large",
      retryable: false
    });
  });

  it("maps Multer LIMIT_FILE_SIZE to 413 import.file_too_large", () => {
    // @ts-expect-error - mock Logger for unit testing
    const filter = new ProblemJsonFilter(logger);
    const { host, response } = mockHost("req-12");
    const error = Object.assign(new Error("File too large"), {
      name: "MulterError",
      code: "LIMIT_FILE_SIZE"
    });

    // @ts-expect-error - mock ArgumentsHost for unit testing
    filter.catch(error, host);

    expect(response.status).toHaveBeenCalledWith(413);
    expect(response.send.mock.calls[0]?.[0]).toMatchObject({
      code: "import.file_too_large",
      retryable: false
    });
  });

  it("maps 400 and 413 HttpExceptions to the catalog codes", () => {
    // @ts-expect-error - mock Logger for unit testing
    const filter = new ProblemJsonFilter(logger);
    const bad = mockHost("req-13");
    // @ts-expect-error - mock ArgumentsHost for unit testing
    filter.catch(new BadRequestException(), bad.host);
    expect(bad.response.send.mock.calls[0]?.[0]).toMatchObject({
      code: "common.malformed_request"
    });

    const large = mockHost("req-14");
    // @ts-expect-error - mock ArgumentsHost for unit testing
    filter.catch(new PayloadTooLargeException(), large.host);
    expect(large.response.send.mock.calls[0]?.[0]).toMatchObject({
      code: "common.payload_too_large"
    });
  });
});
