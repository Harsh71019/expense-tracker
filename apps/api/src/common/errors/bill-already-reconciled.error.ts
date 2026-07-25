import { HttpStatus } from "@nestjs/common";

import { DomainError } from "./domain-error.js";

export class BillAlreadyReconciledError extends DomainError {
  readonly code = "bill.already_reconciled";
  readonly status = HttpStatus.CONFLICT;
  readonly retryable = false;

  constructor() {
    super("A reconciled bill's statement can no longer be changed.");
  }
}
