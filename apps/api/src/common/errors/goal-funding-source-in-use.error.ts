import { HttpStatus } from "@nestjs/common";

import { DomainError } from "./domain-error.js";

export class GoalFundingSourceInUseError extends DomainError {
  readonly code = "goal.funding_source_in_use";
  readonly status = HttpStatus.CONFLICT;
  readonly retryable = false;

  constructor() {
    super("This account or tag is already assigned to another goal.");
  }
}
