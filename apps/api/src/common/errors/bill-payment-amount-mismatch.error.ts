import { HttpStatus } from "@nestjs/common";

import { DomainError } from "./domain-error.js";

export class BillPaymentAmountMismatchError extends DomainError {
  readonly code = "bill.payment_amount_mismatch";
  readonly status = HttpStatus.CONFLICT;
  readonly retryable = false;

  constructor() {
    super(
      "A posted transaction can only be linked for its full amount so both transfer legs remain balanced."
    );
  }
}
