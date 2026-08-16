import { HttpStatus } from "@nestjs/common";

import { DomainError } from "./domain-error.js";

/** Also the answer for another tenant's debt id — never a 403 that confirms it exists. */
export class DeclaredDebtNotFoundError extends DomainError {
  readonly code = "financial_profile.declared_debt_not_found";
  readonly status = HttpStatus.NOT_FOUND;
  readonly retryable = false;

  constructor() {
    super("Declared debt not found.");
  }
}
