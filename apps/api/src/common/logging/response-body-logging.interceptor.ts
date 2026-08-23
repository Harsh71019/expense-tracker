import { Injectable } from "@nestjs/common";
import type { CallHandler, ExecutionContext, NestInterceptor } from "@nestjs/common";
import type { Request } from "express";
import type { Observable } from "rxjs";
import { tap } from "rxjs/operators";

import { LoggingContextService } from "./logging-context.service.js";

const MAX_CAPTURED_RESPONSE_CHARS = 8_192;

// Better Auth's own responses can carry session tokens/secrets in the body;
// the money-domain routes are what's actually useful to see here.
const SKIPPED_PATH_PREFIXES = ["/api/v1/auth"];

@Injectable()
export class ResponseBodyLoggingInterceptor implements NestInterceptor {
  constructor(private readonly context: LoggingContextService) {}

  intercept(executionContext: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = executionContext.switchToHttp().getRequest<Request>();
    if (SKIPPED_PATH_PREFIXES.some((prefix) => request.url.startsWith(prefix))) {
      return next.handle();
    }

    return next.handle().pipe(
      tap((body: unknown) => {
        if (body === undefined) {
          return;
        }
        this.context.set({ resBody: captureResponseBody(body) });
      })
    );
  }
}

function captureResponseBody(body: unknown): unknown {
  const serialized = JSON.stringify(body);
  if (serialized === undefined || serialized.length <= MAX_CAPTURED_RESPONSE_CHARS) {
    return body;
  }
  return `${serialized.slice(0, MAX_CAPTURED_RESPONSE_CHARS)}…[truncated]`;
}
