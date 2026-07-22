import { HttpStatus } from "@nestjs/common";

import { DomainError } from "./domain-error.js";

export class InsufficientScopeError extends DomainError {
  readonly code = "auth.insufficient_scope";
  readonly status = HttpStatus.FORBIDDEN;
  readonly retryable = false;

  constructor() {
    super("This API key does not have the required scope for this action.");
  }
}
