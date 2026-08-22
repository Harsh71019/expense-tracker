import { HttpStatus } from "@nestjs/common";
import { MAX_IMPORT_FILE_SIZE_BYTES } from "@treasury-ops/shared";

import { DomainError } from "./domain-error.js";

export class ImportFileTooLargeError extends DomainError {
  readonly code = "import.file_too_large";
  readonly status = HttpStatus.PAYLOAD_TOO_LARGE;
  readonly retryable = false;

  constructor() {
    super(`The uploaded file exceeds the ${String(MAX_IMPORT_FILE_SIZE_BYTES)}-byte cap.`);
  }
}
