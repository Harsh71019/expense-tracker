import { HttpStatus } from "@nestjs/common";

import { DomainError } from "./domain-error.js";

/** One salary version per user per effective date; corrections use a new date. */
export class DuplicateSalaryEffectiveDateError extends DomainError {
  readonly code = "financial_profile.duplicate_effective_date";
  readonly status = HttpStatus.CONFLICT;
  readonly retryable = false;

  constructor() {
    super("A salary version already exists for this effective date. Pick a different date.");
  }
}
