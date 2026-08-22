import { HttpStatus } from "@nestjs/common";

import { DomainError } from "./domain-error.js";

export class ReceivableCorrectionUnderflowError extends DomainError {
  readonly code = "receivable.correction_underflow";
  readonly status = HttpStatus.CONFLICT;
  readonly retryable = false;

  constructor() {
    super("The correction would take the receivable's outstanding amount below zero.");
  }
}
