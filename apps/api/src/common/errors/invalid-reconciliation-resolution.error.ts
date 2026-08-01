import { HttpStatus } from "@nestjs/common";

import { DomainError } from "./domain-error.js";

export class InvalidReconciliationResolutionError extends DomainError {
  readonly code = "recurring.invalid_reconciliation_resolution";
  readonly status = HttpStatus.UNPROCESSABLE_ENTITY;
  readonly retryable = false;
}
