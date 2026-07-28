import { HttpStatus } from "@nestjs/common";

import { DomainError } from "./domain-error.js";

export class BillNotReconciledError extends DomainError {
  readonly code = "bill.not_reconciled";
  readonly status = HttpStatus.CONFLICT;
  readonly retryable = false;

  constructor() {
    super("The bill must be reconciled before it can be paid.");
  }
}
