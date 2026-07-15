import { HttpStatus } from "@nestjs/common";

import { DomainError } from "./domain-error.js";

export class InvalidValuationSignError extends DomainError {
  readonly code = "asset.invalid_valuation_sign";
  readonly status = HttpStatus.UNPROCESSABLE_ENTITY;
  readonly retryable = false;

  constructor() {
    super("Only a loan_liability asset may carry a negative valuation.");
  }
}
