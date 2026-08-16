import { HttpStatus } from "@nestjs/common";

import { DomainError } from "./domain-error.js";

export class DetectedStreamNotReviewableError extends DomainError {
  readonly code = "recurring.detected_stream_not_reviewable";
  readonly status = HttpStatus.CONFLICT;
  readonly retryable = false;

  constructor() {
    super("This detected stream is no longer available for review.");
  }
}
