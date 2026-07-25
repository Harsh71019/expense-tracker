import { HttpStatus } from "@nestjs/common";

import { DomainError } from "./domain-error.js";

export class BillOverpaymentError extends DomainError {
  readonly code = "bill.overpayment";
  readonly status = HttpStatus.CONFLICT;
  readonly retryable = false;

  constructor() {
    super("The payment exceeds the bill's remaining amount.");
  }
}
