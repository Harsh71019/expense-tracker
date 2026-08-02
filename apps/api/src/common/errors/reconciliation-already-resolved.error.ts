import { HttpStatus } from "@nestjs/common";

import { DomainError } from "./domain-error.js";

export class ReconciliationAlreadyResolvedError extends DomainError {
  readonly code = "recurring.reconciliation_already_resolved";
  readonly status = HttpStatus.CONFLICT;
  readonly retryable = false;

  constructor() {
    super("This reconciliation has already been resolved.");
  }
}
