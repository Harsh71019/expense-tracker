import { HttpStatus } from "@nestjs/common";

import { DomainError } from "./domain-error.js";

export class BillPaymentAccountMismatchError extends DomainError {
  readonly code = "bill.payment_account_mismatch";
  readonly status = HttpStatus.CONFLICT;
  readonly retryable = false;

  constructor() {
    super("The selected bill does not belong to the selected credit-card account.");
  }
}
