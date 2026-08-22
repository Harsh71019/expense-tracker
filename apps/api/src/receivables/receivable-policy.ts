import type { ReceivableStatus } from "@treasury-ops/shared";

import { ReceivableCorrectionUnderflowError } from "../common/errors/receivable-correction-underflow.error.js";
import { ReceivableOverpaymentError } from "../common/errors/receivable-overpayment.error.js";
import type { ReceivableBalance } from "./receivable.repository.js";

/**
 * Pure derivation from plan doc invariant 12: `active` while outstanding is
 * positive; once it reaches zero, `settled` if principal was ever
 * effectively added (repayments/corrections brought it to zero) or
 * `cancelled` if the opening itself was reversed before any principal was
 * ever effective.
 */
export function deriveReceivableStatus(balance: ReceivableBalance): ReceivableStatus {
  if (balance.outstandingMinor > 0) return "active";
  return balance.hasEffectiveOpening ? "settled" : "cancelled";
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
