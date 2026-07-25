import { describe, expect, it } from "vitest";

import { DomainError } from "../domain-error.js";
import { EntityNotFoundError } from "../entity-not-found.error.js";
import { InvalidImportFileError } from "../invalid-import-file.error.js";

class CustomDomainError extends DomainError {
  readonly code = "common.not_found" as const;
  readonly status = 404;
  readonly retryable = false;
}

describe("Domain Errors Unit Tests", () => {
  it("DomainError captures message and name", () => {
    const err = new CustomDomainError("Something missing");
    expect(err.message).toBe("Something missing");
    expect(err.name).toBe("CustomDomainError");
    expect(err.code).toBe("common.not_found");
    expect(err.status).toBe(404);
  });

  it("EntityNotFoundError formats entity name", () => {
    const err = new EntityNotFoundError("Account");
    expect(err.message).toBe("Account not found.");
    expect(err.code).toBe("common.not_found");
    expect(err.status).toBe(404);
  });

  it("InvalidImportFileError sets code and status", () => {
    const err = new InvalidImportFileError("Invalid CSV headers");
    expect(err.message).toBe("Invalid CSV headers");
    expect(err.code).toBe("import.invalid_file");
    expect(err.status).toBe(422);
  });
});
