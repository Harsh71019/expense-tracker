import { HttpStatus } from "@nestjs/common";

import { DomainError } from "./domain-error.js";

/**
 * Covers the two update shapes the data model deliberately does not support:
 * editing a resolved debt (resolution is terminal — declare a new debt
 * instead), and hand-editing the outstanding amount of a debt whose amount is
 * derived from a linked asset's latest valuation.
 */
export class DeclaredDebtNotEditableError extends DomainError {
  readonly code = "financial_profile.declared_debt_not_editable";
  readonly status = HttpStatus.CONFLICT;
  readonly retryable = false;
}
