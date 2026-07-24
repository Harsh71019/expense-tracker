import { HttpStatus } from "@nestjs/common";

import { DomainError } from "./domain-error.js";

export class CategoryKindMismatchError extends DomainError {
  readonly code = "category.kind_mismatch";
  readonly status = HttpStatus.UNPROCESSABLE_ENTITY;
  readonly retryable = false;

  constructor() {
    super("An expense must use an expense category and an income must use an income category.");
  }
}
