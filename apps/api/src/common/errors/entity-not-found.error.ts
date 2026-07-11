import { HttpStatus } from "@nestjs/common";

import { DomainError } from "./domain-error.js";

export class EntityNotFoundError extends DomainError {
  readonly code = "entity-not-found";
  readonly status = HttpStatus.NOT_FOUND;

  constructor(entity: string) {
    super(`${entity} not found.`);
  }
}
