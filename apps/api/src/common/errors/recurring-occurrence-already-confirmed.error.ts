import { HttpStatus } from "@nestjs/common";

import { DomainError } from "./domain-error.js";

export class RecurringOccurrenceAlreadyConfirmedError extends DomainError {
  readonly code = "recurring.occurrence_already_confirmed";
  readonly status = HttpStatus.CONFLICT;
  readonly retryable = false;

  constructor() {
    super("This recurring occurrence is already confirmed by a linked transaction.");
  }
}
