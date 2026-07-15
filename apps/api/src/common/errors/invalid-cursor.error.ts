import { HttpStatus } from "@nestjs/common";

import { DomainError } from "./domain-error.js";

export class InvalidCursorError extends DomainError {
  readonly code = "common.invalid_cursor";
  readonly status = HttpStatus.BAD_REQUEST;
  readonly retryable = false;

  constructor() {
    super("Invalid cursor.");
  }
}
