import { HttpStatus } from "@nestjs/common";

import { DomainError } from "./domain-error.js";

export class InvalidGoalOrderError extends DomainError {
  readonly code = "goal.invalid_order";
  readonly status = HttpStatus.CONFLICT;
  readonly retryable = false;

  constructor() {
    super("goalIds must contain every active goal exactly once.");
  }
}
