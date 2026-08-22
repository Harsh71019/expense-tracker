import { HttpStatus } from "@nestjs/common";

import { DomainError } from "./domain-error.js";

export class ReceivableReversalBlockedError extends DomainError {
  readonly code = "receivable.reversal_blocked";
  readonly status = HttpStatus.CONFLICT;
  readonly retryable = false;

  constructor() {
    super(
      "Reversing this transaction would drive the linked receivable's outstanding amount below " +
        "zero. Reverse dependent repayments first."
    );
  }
}
