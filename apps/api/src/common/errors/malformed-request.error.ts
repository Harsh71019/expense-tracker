import { HttpStatus } from "@nestjs/common";

import { DomainError } from "./domain-error.js";

export class MalformedRequestError extends DomainError {
  readonly code = "common.malformed_request";
  readonly status = HttpStatus.BAD_REQUEST;
  readonly retryable = false;

  constructor(message = "The request body is not valid JSON.") {
    super(message);
  }
}
