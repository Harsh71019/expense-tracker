import { HttpStatus } from "@nestjs/common";

import { DomainError } from "./domain-error.js";

export class TransactionNotReversibleError extends DomainError {
  readonly code = "transaction-not-reversible";
  readonly status = HttpStatus.CONFLICT;

  constructor() {
    super("Transaction cannot be reversed.");
  }
}
