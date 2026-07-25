import { HttpStatus } from "@nestjs/common";

import { DomainError } from "./domain-error.js";

export class BillStatementUnresolvedError extends DomainError {
  readonly code = "bill.unresolved_statement";
  readonly status = HttpStatus.CONFLICT;
  readonly retryable = false;

  constructor() {
    super("Every statement row must be matched or acknowledged before reconciliation.");
  }
}
