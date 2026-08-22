import { HttpStatus } from "@nestjs/common";

import { DomainError } from "./domain-error.js";

/** Thrown when a valuation/close operation targets a legacy `loan_receivable`
 * asset that has been backfilled into the receivables sub-ledger (plan doc
 * §13.2) -- it must be managed through /v1/receivables/{receivableId} now. */
export class AssetMovedToReceivablesError extends DomainError {
  readonly code = "asset.moved_to_receivables";
  readonly status = HttpStatus.CONFLICT;
  readonly retryable = false;
  override readonly headers: Readonly<Record<string, string>>;

  constructor(readonly receivableId: string) {
    super(
      `This asset moved to Debt Given and is managed at receivable ${receivableId}, not through Assets.`
    );
    this.headers = { "X-Receivable-Id": receivableId };
  }
}
