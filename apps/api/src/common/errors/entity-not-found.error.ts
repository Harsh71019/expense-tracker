import { HttpStatus } from "@nestjs/common";

import { DomainError } from "./domain-error.js";

export class EntityNotFoundError extends DomainError {
  readonly code = "common.not_found";
  readonly status = HttpStatus.NOT_FOUND;
  readonly retryable = false;

  constructor(entity: string) {
    super(`${entity} not found.`);
  }
}
