import { Catch, HttpException, HttpStatus } from "@nestjs/common";
import type { ArgumentsHost, ExceptionFilter } from "@nestjs/common";
import type { ErrorCode } from "@vyaya/shared";
import type { Request, Response } from "express";
import { Logger } from "nestjs-pino";
import { ZodError } from "zod";

import { DomainError } from "./domain-error.js";

type FieldError = Readonly<{ path: string; code: string; message: string }>;

type ProblemDetails = Readonly<{
  type: string;
  title: string;
  status: number;
  detail: string;
  instance: string;
  code: string;
  reqId: string;
  timestamp: string;
  retryable: boolean;
  errors: readonly FieldError[] | null;
}>;

@Catch()
export class ProblemJsonFilter implements ExceptionFilter {
  constructor(private readonly logger: Logger) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const context = host.switchToHttp();
    const request = context.getRequest<Request>();
    const response = context.getResponse<Response>();
    const reqId = requestId(response);
    const problem = toProblemDetails(exception, request.originalUrl, reqId);

    if (!isExpectedException(exception)) {
      this.logger.error(
        { err: exception, event: "http.unexpected_error", reqId },
        "unexpected request failure"
      );
    }

    response.status(problem.status).type("application/problem+json").send(problem);
  }
}

function toProblemDetails(exception: unknown, instance: string, reqId: string): ProblemDetails {
  const timestamp = new Date().toISOString();

  if (exception instanceof ZodError) {
    return {
      type: "https://vyaya.app/problems/common.validation_failed",
      title: "Validation failed",
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      detail: `${exception.issues.length} field(s) failed validation.`,
      instance,
      code: "common.validation_failed",
      reqId,
      timestamp,
      retryable: false,
      errors: exception.issues.map((issue) => ({
        path: issue.path.join("."),
        code: issue.code,
        message: issue.message
      }))
    };
  }

  if (exception instanceof DomainError) {
    return {
      type: `https://vyaya.app/problems/${exception.code}`,
      title: exception.name,
      status: exception.status,
      detail: exception.message,
      instance,
      code: exception.code,
      reqId,
      timestamp,
      retryable: exception.retryable,
      errors: null
    };
  }

  if (exception instanceof HttpException) {
    const status = exception.getStatus();
    return {
      type: "about:blank",
      title: exception.name,
      status,
      detail: exception.message,
      instance,
      code: codeForStatus(status),
      reqId,
      timestamp,
      retryable: isRetryableStatus(status),
      errors: null
    };
  }

  return {
    type: "about:blank",
    title: "Internal Server Error",
    status: HttpStatus.INTERNAL_SERVER_ERROR,
    detail: `An unexpected error occurred. Reference: ${reqId}.`,
    instance,
    code: "common.internal",
    reqId,
    timestamp,
    retryable: false,
    errors: null
  };
}

function codeForStatus(status: number): ErrorCode {
  switch (status) {
    case HttpStatus.UNAUTHORIZED:
      return "auth.unauthenticated";
    case HttpStatus.NOT_FOUND:
      return "common.not_found";
    case HttpStatus.SERVICE_UNAVAILABLE:
      return "common.dependency_unavailable";
    default:
      return "common.internal";
  }
}

function isRetryableStatus(status: number): boolean {
  return status === HttpStatus.TOO_MANY_REQUESTS || status === HttpStatus.SERVICE_UNAVAILABLE;
}

function requestId(response: Response): string {
  const header = response.getHeader("x-request-id");
  return typeof header === "string" ? header : "unknown";
}

function isExpectedException(exception: unknown): boolean {
  return (
    exception instanceof ZodError ||
    exception instanceof DomainError ||
    exception instanceof HttpException
  );
}
