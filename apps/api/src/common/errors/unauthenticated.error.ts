import { HttpStatus } from "@nestjs/common";

import { DomainError } from "./domain-error.js";

export class UnauthenticatedError extends DomainError {
  readonly code = "auth.unauthenticated";
  readonly status = HttpStatus.UNAUTHORIZED;
  readonly retryable = false;

  constructor() {
    super("Authentication required.");
  }
}
