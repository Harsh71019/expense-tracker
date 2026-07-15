import { HttpStatus } from "@nestjs/common";

import { DomainError } from "./domain-error.js";

export class TransactionNotReversibleError extends DomainError {
  readonly code = "txn.already_reversed";
  readonly status = HttpStatus.CONFLICT;
  readonly retryable = false;

  constructor() {
    super("Transaction cannot be reversed.");
  }
}
