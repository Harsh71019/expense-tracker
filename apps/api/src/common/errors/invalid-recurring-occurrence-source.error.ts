import { HttpStatus } from "@nestjs/common";

import { DomainError } from "./domain-error.js";

export class InvalidRecurringOccurrenceSourceError extends DomainError {
  readonly code = "recurring.invalid_occurrence_source";
  readonly status = HttpStatus.CONFLICT;
  readonly retryable = false;

  constructor() {
    super(
      "The transaction is not eligible to be linked to this occurrence. It must be a posted " +
        "transaction on the rule's account and type, not already part of a recurring rule."
    );
  }
}
