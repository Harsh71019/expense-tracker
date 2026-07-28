import { HttpStatus } from "@nestjs/common";

import { DomainError } from "./domain-error.js";

export class InvalidCreditCardAccountError extends DomainError {
  readonly code = "bill.invalid_account_type";
  readonly status = HttpStatus.CONFLICT;
  readonly retryable = false;

  constructor() {
    super("The selected account is not an active credit-card account.");
  }
}
