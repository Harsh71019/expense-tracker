import { HttpStatus } from "@nestjs/common";

import { DomainError } from "./domain-error.js";

export class MoneyOutOfRangeError extends DomainError {
  readonly code = "money.out_of_range";
  readonly status = HttpStatus.UNPROCESSABLE_ENTITY;
  readonly retryable = false;

  constructor() {
    super("The resulting money value is outside the supported safe-integer paise range.");
  }
}
