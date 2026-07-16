import { HttpStatus } from "@nestjs/common";

import { DomainError } from "./domain-error.js";

export class ImportAlreadyCommittedError extends DomainError {
  readonly code = "import.already_committed";
  readonly status = HttpStatus.CONFLICT;
  readonly retryable = false;

  constructor() {
    super("This file has already been imported and committed.");
  }
}
