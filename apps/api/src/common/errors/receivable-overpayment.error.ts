import { HttpStatus } from "@nestjs/common";

import { DomainError } from "./domain-error.js";

export class ReceivableOverpaymentError extends DomainError {
  readonly code = "receivable.overpayment";
  readonly status = HttpStatus.CONFLICT;
  readonly retryable = false;

  constructor() {
    super("The repayment exceeds the receivable's outstanding amount.");
  }
}
