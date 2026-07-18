import { HttpStatus } from "@nestjs/common";

import { DomainError } from "./domain-error.js";

export class CategoryParentKindMismatchError extends DomainError {
  readonly code = "category.parent_kind_mismatch";
  readonly status = HttpStatus.UNPROCESSABLE_ENTITY;
  readonly retryable = false;

  constructor() {
    super("A child category must have the same kind as its parent.");
  }
}
