import { HttpStatus } from "@nestjs/common";

import { DomainError } from "./domain-error.js";

export class CategoryNameConflictError extends DomainError {
  readonly code = "category.name_conflict";
  readonly status = HttpStatus.CONFLICT;
  readonly retryable = false;

  constructor() {
    super("An active sibling category already uses this name. Rename the category and try again.");
  }
}
