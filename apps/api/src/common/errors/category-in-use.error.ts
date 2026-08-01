import { HttpStatus } from "@nestjs/common";

import { DomainError } from "./domain-error.js";

export class CategoryInUseError extends DomainError {
  readonly code = "category.in_use";
  readonly status = HttpStatus.CONFLICT;
  readonly retryable = false;

  constructor(message = "This category is still in use and cannot be permanently deleted.") {
    super(message);
  }
}
