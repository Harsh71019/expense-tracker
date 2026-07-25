import { HttpStatus } from "@nestjs/common";

import { DomainError } from "./domain-error.js";

export class BillStatementNotReadyError extends DomainError {
  readonly code = "bill.statement_not_ready";
  readonly status = HttpStatus.CONFLICT;
  readonly retryable = false;
}
