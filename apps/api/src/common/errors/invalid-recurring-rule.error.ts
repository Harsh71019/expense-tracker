import { HttpStatus } from "@nestjs/common";

import { DomainError } from "./domain-error.js";

export class InvalidRecurringRuleError extends DomainError {
  readonly code = "recurring.no_occurrences";
  readonly status = HttpStatus.UNPROCESSABLE_ENTITY;
  readonly retryable = false;

  constructor() {
    super("This rrule and startAt combination produces no occurrences.");
  }
}
