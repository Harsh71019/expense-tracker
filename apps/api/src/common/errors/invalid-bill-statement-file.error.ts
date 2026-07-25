import { HttpStatus } from "@nestjs/common";

import { DomainError } from "./domain-error.js";

export class InvalidBillStatementFileError extends DomainError {
  readonly code = "bill.invalid_statement_file";
  readonly status = HttpStatus.UNPROCESSABLE_ENTITY;
  readonly retryable = false;
}
