import { HttpStatus } from "@nestjs/common";

import { DomainError } from "./domain-error.js";

export class InvalidImportFileError extends DomainError {
  readonly code = "import.invalid_file";
  readonly status = HttpStatus.UNPROCESSABLE_ENTITY;
  readonly retryable = false;
}
