import { HttpStatus } from "@nestjs/common";

import { DomainError } from "./domain-error.js";

export class InvalidBillPaymentSourceError extends DomainError {
  readonly code = "bill.invalid_payment_source";
  readonly status = HttpStatus.CONFLICT;
  readonly retryable = false;

  constructor() {
    super(
      "The transaction is not eligible to be linked as a bill payment. It must be a posted " +
        "expense on a non-credit-card account that is not already part of a transfer or bill."
    );
  }
}
