import { createHash } from "node:crypto";

import type { TransactionType } from "@treasury-ops/shared";

import { toISTCalendarDate } from "../common/time/ist.js";
import {
  normalizeTransactionText,
  TRANSACTION_TEXT_NORMALIZER_VERSION
} from "../common/transaction-text/normalize-transaction-text.js";

export const DEDUPE_FINGERPRINT_V2_VERSION = 2;

/**
 * dedupeFingerprintV2 =
 *   sha256(fingerprintVersion|normalizerVersion|userId|accountId|type|IST-day|amountMinor|normalizedText)
 *
 * Type-aware, unlike the v1 hash (`dedupe-hash.ts`): an expense and a
 * same-day, same-amount, same-narration reversal/refund no longer collide.
 * Both the fingerprint version and the narration-normalizer version are part
 * of the hashed payload, so bumping either one automatically mints a
 * disjoint fingerprint space rather than silently reinterpreting stored
 * values — old rows keep whatever fingerprint they were computed with.
 */
export function computeDedupeFingerprintV2(
  userId: string,
  accountId: string,
  type: TransactionType,
  occurredAt: Date,
  amountMinor: number,
  description: string
): string {
  const day = toISTCalendarDate(occurredAt);
  const normalizedText = normalizeTransactionText(description);
  const payload = [
    DEDUPE_FINGERPRINT_V2_VERSION,
    TRANSACTION_TEXT_NORMALIZER_VERSION,
    userId,
    accountId,
    type,
    day,
    amountMinor,
    normalizedText.normalized
  ].join("|");
  return createHash("sha256").update(payload).digest("hex");
}
