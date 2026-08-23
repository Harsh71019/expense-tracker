import { HttpStatus } from "@nestjs/common";
import { MAX_PORTFOLIO_IMPORT_FILE_SIZE_BYTES } from "@treasury-ops/shared";

import { DomainError } from "./domain-error.js";

export class CasPasswordRequiredError extends DomainError {
  readonly code = "portfolio_import.password_required" as const;
  readonly status = HttpStatus.UNPROCESSABLE_ENTITY;
  readonly retryable = false;

  constructor(
    message = "This statement is password-protected. Please supply the statement password."
  ) {
    super(message);
  }
}

export class CasPasswordInvalidError extends DomainError {
  readonly code = "portfolio_import.password_invalid" as const;
  readonly status = HttpStatus.UNPROCESSABLE_ENTITY;
  readonly retryable = false;

  constructor(message = "The supplied password was unable to decrypt the statement.") {
    super(message);
  }
}

export class UnsupportedCasLayoutError extends DomainError {
  readonly code = "portfolio_import.unsupported_layout" as const;
  readonly status = HttpStatus.UNPROCESSABLE_ENTITY;
  readonly retryable = false;

  constructor(
    message = "Unsupported statement layout. Only recognized KFintech/CAMS text statements are supported."
  ) {
    super(message);
  }
}

export class UnsupportedScannedStatementError extends DomainError {
  readonly code = "portfolio_import.unsupported_scanned" as const;
  readonly status = HttpStatus.UNPROCESSABLE_ENTITY;
  readonly retryable = false;

  constructor(
    message = "The uploaded PDF contains no extractable text layer. Scanned images are not supported."
  ) {
    super(message);
  }
}

export class DuplicatePortfolioImportError extends DomainError {
  readonly code = "portfolio_import.duplicate" as const;
  readonly status = HttpStatus.CONFLICT;
  readonly retryable = false;

  constructor(message = "This statement has already been uploaded and processed.") {
    super(message);
  }
}

export class PortfolioImportStateConflictError extends DomainError {
  readonly code = "portfolio_import.invalid_state" as const;
  readonly status = HttpStatus.CONFLICT;
  readonly retryable = false;

  constructor(message = "The portfolio import batch is not in a valid state for this operation.") {
    super(message);
  }
}

export class PortfolioImportTooLargeError extends DomainError {
  readonly code = "portfolio_import.file_too_large" as const;
  readonly status = HttpStatus.PAYLOAD_TOO_LARGE;
  readonly retryable = false;

  constructor() {
    super(
      `The uploaded file exceeds the ${String(MAX_PORTFOLIO_IMPORT_FILE_SIZE_BYTES)}-byte cap.`
    );
  }
}

export class InvalidPdfError extends DomainError {
  readonly code = "portfolio_import.invalid_pdf" as const;
  readonly status = HttpStatus.BAD_REQUEST;
  readonly retryable = false;

  constructor(message = "The uploaded file is not a valid PDF.") {
    super(message);
  }
}
