import { HttpStatus } from "@nestjs/common";

import { DomainError } from "./domain-error.js";

export class IdempotencyConflictError extends DomainError {
  readonly code = "common.idempotency_conflict";
  readonly status = HttpStatus.CONFLICT;
  readonly retryable = false;

  constructor() {
    super("This idempotency key was already used for a different request.");
  }
}
