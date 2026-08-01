import { Catch, HttpException, HttpStatus } from "@nestjs/common";
import type { ArgumentsHost, ExceptionFilter } from "@nestjs/common";
import type { ErrorCode } from "@treasury-ops/shared";
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
  message: string;
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

    if (exception instanceof DomainError && exception.headers !== undefined) {
      response.set(exception.headers);
    }

    response.status(problem.status).type("application/problem+json").send(problem);
  }
}

function toProblemDetails(exception: unknown, instance: string, reqId: string): ProblemDetails {
  const timestamp = new Date().toISOString();

  if (exception instanceof ZodError) {
    const message = `${exception.issues.length} field(s) failed validation.`;
    return {
      type: "https://treasury-ops.app/problems/common.validation_failed",
      title: "Validation failed",
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      detail: message,
      message,
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
      type: `https://treasury-ops.app/problems/${exception.code}`,
      title: exception.name,
      status: exception.status,
      detail: exception.message,
      message: exception.message,
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
    const message = messageForHttpException(exception, status);
    return {
      type: "about:blank",
      title: exception.name,
      status,
      detail: message,
      message,
      instance,
      code: codeForStatus(status),
      reqId,
      timestamp,
      retryable: isRetryableStatus(status),
      errors: null
    };
  }

  const message = `An unexpected error occurred. Reference: ${reqId}.`;
  return {
    type: "about:blank",
    title: "Internal Server Error",
    status: HttpStatus.INTERNAL_SERVER_ERROR,
    detail: message,
    message,
    instance,
    code: "common.internal",
    reqId,
    timestamp,
    retryable: false,
    errors: null
  };
}

function messageForHttpException(exception: HttpException, status: number): string {
  switch (status) {
    case HttpStatus.BAD_REQUEST:
      return "The request is invalid.";
    case HttpStatus.UNAUTHORIZED:
      return "Authentication required.";
    case HttpStatus.FORBIDDEN:
      return "You do not have permission to perform this action.";
    case HttpStatus.NOT_FOUND:
      return exception.message === "Not Found"
        ? "The requested resource was not found."
        : exception.message;
    case HttpStatus.CONFLICT:
      return "The request conflicts with the current state.";
    case HttpStatus.TOO_MANY_REQUESTS:
      return "Too many requests. Wait a moment and try again.";
    case HttpStatus.UNPROCESSABLE_ENTITY:
      return "Some request values are invalid.";
    case HttpStatus.SERVICE_UNAVAILABLE:
      return "A required service is temporarily unavailable.";
    default:
      return status >= 500
        ? "An unexpected error occurred."
        : "The request could not be completed.";
  }
}

function codeForStatus(status: number): ErrorCode {
  switch (status) {
    case HttpStatus.UNAUTHORIZED:
      return "auth.unauthenticated";
    case HttpStatus.FORBIDDEN:
      return "auth.insufficient_scope";
    case HttpStatus.TOO_MANY_REQUESTS:
      return "auth.rate_limited";
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
