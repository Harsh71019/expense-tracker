import { HttpStatus } from "@nestjs/common";

import { DomainError } from "./domain-error.js";

export class ReceivableTransactionIneligibleError extends DomainError {
  readonly code = "receivable.transaction_ineligible";
  readonly status = HttpStatus.CONFLICT;
  readonly retryable = false;

  constructor() {
    super(
      "The transaction must be a posted, unlinked income transaction with no transfer group to " +
        "link as a repayment."
    );
  }
}
