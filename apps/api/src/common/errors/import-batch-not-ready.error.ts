import { HttpStatus } from "@nestjs/common";

import { DomainError } from "./domain-error.js";

export class ImportBatchNotReadyError extends DomainError {
  readonly code = "import.invalid_state";
  readonly status = HttpStatus.CONFLICT;
  readonly retryable = false;
}
