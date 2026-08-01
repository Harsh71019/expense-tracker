import { HttpStatus } from "@nestjs/common";

import { DomainError } from "./domain-error.js";

export class CategoryHierarchyConflictError extends DomainError {
  readonly code = "category.hierarchy_conflict";
  readonly status = HttpStatus.CONFLICT;
  readonly retryable = false;
}
