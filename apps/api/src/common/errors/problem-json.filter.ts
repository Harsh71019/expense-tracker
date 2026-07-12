import { Catch, HttpException, HttpStatus } from "@nestjs/common";
import type { ArgumentsHost, ExceptionFilter } from "@nestjs/common";
import type { Request, Response } from "express";
import { Logger } from "nestjs-pino";
import { ZodError } from "zod";

import { DomainError } from "./domain-error.js";

type ProblemDetails = Readonly<{
  type: string;
  title: string;
  status: number;
  detail: string;
  instance: string;
}>;

@Catch()
export class ProblemJsonFilter implements ExceptionFilter {
  constructor(private readonly logger: Logger) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const context = host.switchToHttp();
    const request = context.getRequest<Request>();
    const response = context.getResponse<Response>();
    const problem = this.toProblemDetails(exception, request.originalUrl);

    if (!isExpectedException(exception)) {
      this.logger.error(
        { err: exception, event: "http.unexpected_error" },
        "unexpected request failure"
      );
    }

    response.status(problem.status).type("application/problem+json").send(problem);
  }

  private toProblemDetails(exception: unknown, instance: string): ProblemDetails {
    if (exception instanceof ZodError) {
      return {
        type: "https://vyaya.dev/problems/validation-failed",
        title: "Bad Request",
        status: HttpStatus.BAD_REQUEST,
        detail: "Request validation failed.",
        instance
      };
    }

    if (exception instanceof DomainError) {
      return {
        type: `https://vyaya.dev/problems/${exception.code}`,
        title: exception.name,
        status: exception.status,
        detail: exception.message,
        instance
      };
    }

    if (exception instanceof HttpException) {
      return {
        type: "about:blank",
        title: exception.name,
        status: exception.getStatus(),
        detail: exception.message,
        instance
      };
    }

    return {
      type: "about:blank",
      title: "Internal Server Error",
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      detail: "An unexpected error occurred.",
      instance
    };
  }
}

function isExpectedException(exception: unknown): boolean {
  return (
    exception instanceof ZodError ||
    exception instanceof DomainError ||
    exception instanceof HttpException
  );
}
