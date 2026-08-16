import { HttpStatus } from "@nestjs/common";

import { DomainError } from "./domain-error.js";

/** A declared debt may only derive its outstanding amount from a `loan_liability` asset. */
export class LinkedAssetNotLoanLiabilityError extends DomainError {
  readonly code = "financial_profile.linked_asset_not_loan_liability";
  readonly status = HttpStatus.UNPROCESSABLE_ENTITY;
  readonly retryable = false;

  constructor() {
    super("Only a loan liability asset can back a declared debt.");
  }
}
