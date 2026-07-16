import { createHash } from "node:crypto";

import { toISTCalendarDate } from "../common/time/ist.js";

const UPI_REF_PATTERN = /\b\d{10,}\b/g;

/**
 * Normalizes a transaction description for dedupe comparison: lowercased,
 * whitespace-collapsed, long digit runs (UPI/bank reference numbers, which
 * differ per-transaction even for an otherwise identical recurring payment)
 * stripped. Per BACKEND.md §4.
 */
export function normalizeDescription(description: string): string {
  return description.toLowerCase().replace(UPI_REF_PATTERN, "").replace(/\s+/g, " ").trim();
}

/**
 * dedupeHash = sha256(userId|accountId|date(day)|amountMinor|normalizedDescription),
 * per BACKEND.md §4. Bucketed to the Asia/Kolkata calendar day, not the
 * instant, so a same-day import and manual entry of the same transaction
 * dedupe against each other regardless of time-of-day.
 */
export function computeDedupeHash(
  userId: string,
  accountId: string,
  occurredAt: Date,
  amountMinor: number,
  description: string
): string {
  const day = toISTCalendarDate(occurredAt);
  const normalized = normalizeDescription(description);
  const payload = `${userId}|${accountId}|${day}|${amountMinor}|${normalized}`;
  return createHash("sha256").update(payload).digest("hex");
}
