import { Injectable, type NestMiddleware } from "@nestjs/common";
import type { NextFunction, Request, Response } from "express";

import { LoggingContextService } from "./logging-context.service.js";

@Injectable()
export class RequestContextMiddleware implements NestMiddleware {
  constructor(private readonly context: LoggingContextService) {}

  use(request: Request, response: Response, next: NextFunction): void {
    const requestedId = request.headers["x-request-id"];
    const reqId = typeof requestedId === "string" ? requestedId : crypto.randomUUID();
    response.setHeader("x-request-id", reqId);
    this.context.run({ reqId }, next);
  }
}
