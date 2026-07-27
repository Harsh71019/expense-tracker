import { Injectable } from "@nestjs/common";
import type { NestMiddleware } from "@nestjs/common";
import type { NextFunction, Request, Response } from "express";

import { MetricsService } from "./metrics.service.js";

const EXCLUDED_PATHS = new Set(["/api/healthz", "/api/readyz", "/api/v1/metrics"]);

@Injectable()
export class HttpMetricsMiddleware implements NestMiddleware {
  constructor(private readonly metrics: MetricsService) {}

  use(request: Request, response: Response, next: NextFunction): void {
    if (EXCLUDED_PATHS.has(pathWithoutQuery(request.originalUrl))) {
      next();
      return;
    }

    const startedAt = performance.now();
    response.once("finish", () => {
      this.metrics.recordHttp(
        request.method,
        routePattern(request),
        response.statusCode,
        performance.now() - startedAt
      );
    });
    next();
  }
}

function pathWithoutQuery(url: string): string {
  const queryStart = url.indexOf("?");
  return queryStart === -1 ? url : url.slice(0, queryStart);
}

function routePattern(request: Request): string {
  const route = request.route;
  if (route === undefined || typeof route.path !== "string") return "unmatched";
  return `${request.baseUrl}${route.path}`;
}
