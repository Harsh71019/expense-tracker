import type { ReceivableStatus } from "@treasury-ops/shared";

import { ReceivableCorrectionUnderflowError } from "../common/errors/receivable-correction-underflow.error.js";
import { ReceivableOverpaymentError } from "../common/errors/receivable-overpayment.error.js";
import type { ReceivableBalance } from "./receivable.repository.js";

/**
 * Pure derivation from plan doc invariant 12: `active` while outstanding is
 * positive. At zero outstanding, `cancelled` means an opening existed at
 * some point but is no longer effective (the cash-backed lend was reversed
 * before any repayment) -- `hasAnyOpeningEver && !hasEffectiveOpening`.
 * Everything else at zero is `settled`, which covers both "an effective
 * opening was paid down to zero" and "no opening ever existed" (a migrated
 * legacy asset whose every historical valuation was exactly zero gets zero
 * receivable_events at all, since the backfill skips zero deltas -- that's a
 * legitimately-zero receivable, not a cancelled one).
 */
export function deriveReceivableStatus(balance: ReceivableBalance): ReceivableStatus {
  if (balance.outstandingMinor > 0) return "active";
  if (balance.hasAnyOpeningEver && !balance.hasEffectiveOpening) return "cancelled";
  return "settled";
}

export function assertNotOverpaying(outstandingMinor: number, amountMinor: number): void {
  if (amountMinor > outstandingMinor) throw new ReceivableOverpaymentError();
}

export function assertCorrectionWithinBounds(
  outstandingMinor: number,
  direction: "increase" | "decrease",
  amountMinor: number
): void {
  if (direction === "decrease" && amountMinor > outstandingMinor) {
    throw new ReceivableCorrectionUnderflowError();
  }
}
