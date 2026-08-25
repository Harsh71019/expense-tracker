import { HttpStatus } from "@nestjs/common";

import { DomainError } from "./domain-error.js";

export class UnsupportedReserveSourceError extends DomainError {
  readonly code = "financial_safety.unsupported_reserve_source";
  readonly status = HttpStatus.UNPROCESSABLE_ENTITY;
  readonly retryable = false;
}
