import { HttpStatus } from "@nestjs/common";

import { DomainError } from "./domain-error.js";

export class RateLimitedError extends DomainError {
  readonly code = "auth.rate_limited";
  readonly status = HttpStatus.TOO_MANY_REQUESTS;
  readonly retryable = true;
  override readonly headers: Readonly<Record<string, string>>;

  constructor(retryAfterSeconds: number) {
    super("API key rate limit exceeded.");
    this.headers = { "Retry-After": String(retryAfterSeconds) };
  }
}
