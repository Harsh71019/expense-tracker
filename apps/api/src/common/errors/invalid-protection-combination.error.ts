import { HttpStatus } from "@nestjs/common";

import { DomainError } from "./domain-error.js";

/**
 * Defence in depth. The Zod contract in `packages/shared` owns these rules and
 * rejects an invalid combination before it reaches the database; this error
 * exists so that if a database CHECK constraint mirroring one of those rules
 * ever fires anyway, the caller gets a validation problem rather than a 500.
 */
export class InvalidProtectionCombinationError extends DomainError {
  readonly code = "financial_profile.invalid_protection_combination";
  readonly status = HttpStatus.UNPROCESSABLE_ENTITY;
  readonly retryable = false;

  constructor() {
    super("These protection answers do not go together. Review the cover amounts and statuses.");
  }
}
