import { HttpStatus } from "@nestjs/common";

import { DomainError } from "./domain-error.js";

export class DependencyUnavailableError extends DomainError {
  readonly code = "common.dependency_unavailable";
  readonly status = HttpStatus.SERVICE_UNAVAILABLE;
  readonly retryable = true;
}
