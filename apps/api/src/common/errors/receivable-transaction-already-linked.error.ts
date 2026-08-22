import { HttpStatus } from "@nestjs/common";

import { DomainError } from "./domain-error.js";

export class ReceivableTransactionAlreadyLinkedError extends DomainError {
  readonly code = "receivable.transaction_already_linked";
  readonly status = HttpStatus.CONFLICT;
  readonly retryable = false;

  constructor() {
    super("This transaction is already linked to a receivable event.");
  }
}
