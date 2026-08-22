import { HttpStatus } from "@nestjs/common";

import { DomainError } from "./domain-error.js";

export class PayloadTooLargeError extends DomainError {
  readonly code = "common.payload_too_large";
  readonly status = HttpStatus.PAYLOAD_TOO_LARGE;
  readonly retryable = false;

  constructor(message = "The request body exceeds the allowed size.") {
    super(message);
  }
}
