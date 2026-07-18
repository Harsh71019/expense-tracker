import { HttpStatus } from "@nestjs/common";

import { DomainError } from "./domain-error.js";

export class TransferMetadataRequiresGroupError extends DomainError {
  readonly code = "txn.transfer_metadata_requires_group";
  readonly status = HttpStatus.CONFLICT;
  readonly retryable = false;

  constructor() {
    super("Transfer leg metadata cannot be edited independently.");
  }
}
