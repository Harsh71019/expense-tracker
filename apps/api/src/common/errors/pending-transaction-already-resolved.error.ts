import { HttpStatus } from "@nestjs/common";

import { DomainError } from "./domain-error.js";

export class PendingTransactionAlreadyResolvedError extends DomainError {
  readonly code = "pending_transaction.already_resolved";
  readonly status = HttpStatus.CONFLICT;
  readonly retryable = false;

  constructor() {
    super("This pending transaction has already been dismissed.");
  }
}
