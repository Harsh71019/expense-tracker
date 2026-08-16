import { HttpStatus } from "@nestjs/common";

import { DomainError } from "./domain-error.js";

/**
 * Raised when a derived salary result is requested before the user has saved
 * both a work profile and a salary version. Deliberately not a 404: the
 * resource is not missing, the prerequisite setup step has not happened, and
 * the client is expected to show the setup call to action.
 */
export class FinancialProfileNotConfiguredError extends DomainError {
  readonly code = "financial_profile.not_configured";
  readonly status = HttpStatus.UNPROCESSABLE_ENTITY;
  readonly retryable = false;

  constructor() {
    super("Add your net monthly salary and work schedule before requesting salary statistics.");
  }
}
