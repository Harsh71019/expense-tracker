import { HttpStatus } from "@nestjs/common";

import { DomainError } from "./domain-error.js";

/** One protection snapshot per user per effective date; corrections use a new date. */
export class DuplicateProtectionEffectiveDateError extends DomainError {
  readonly code = "financial_profile.duplicate_protection_effective_date";
  readonly status = HttpStatus.CONFLICT;
  readonly retryable = false;

  constructor() {
    super("A protection snapshot already exists for this effective date. Pick a different date.");
  }
}
