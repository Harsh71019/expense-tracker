import {
  calendarDayDistance,
  type RecurringRuleId,
  type TransactionId
} from "@treasury-ops/shared";

export const RECONCILIATION_WINDOW_DAYS = 3;

export type RecurringCandidate = Readonly<{
  transactionId: TransactionId;
  ruleId: RecurringRuleId;
  accountId: string;
  type: "expense" | "income";
  amountMinor: number;
  occurredAt: Date;
}>;

export type IncomingTransaction = Readonly<{
  accountId: string;
  type: "expense" | "income";
  amountMinor: number;
  occurredAt: Date;
}>;

export type ReconciliationMatch =
  | Readonly<{ outcome: "no_match" }>
  | Readonly<{
      outcome: "auto_matched";
      recurringTransactionId: TransactionId;
      recurringRuleId: RecurringRuleId;
    }>
  | Readonly<{ outcome: "ambiguous"; candidateTransactionIds: readonly TransactionId[] }>
  | Readonly<{ outcome: "amount_mismatch"; candidateTransactionIds: readonly TransactionId[] }>;

/**
 * Two-tier match, mirroring statement-matcher.ts's rank-then-classify shape:
 * tier 1 requires an exact amount match (the common case — a recurring
 * template's amount and the real charge should agree); tier 2 only runs when
 * tier 1 finds nothing, and drops the amount filter to catch "same account,
 * same rough date, but the number is off" (price change, partial charge) --
 * the case the user explicitly wants flagged rather than silently ignored.
 */
export function matchIncomingTransaction(
  incoming: IncomingTransaction,
  candidates: readonly RecurringCandidate[]
): ReconciliationMatch {
  const sameWindow = candidates.filter(
    (candidate) =>
      candidate.accountId === incoming.accountId &&
      candidate.type === incoming.type &&
      calendarDayDistance(candidate.occurredAt, incoming.occurredAt) <= RECONCILIATION_WINDOW_DAYS
  );

  const exact = sameWindow.filter((candidate) => candidate.amountMinor === incoming.amountMinor);
  if (exact.length === 1) {
    const [only] = exact;
    if (only === undefined) throw new Error("unreachable: exact.length === 1");
    return {
      outcome: "auto_matched",
      recurringTransactionId: only.transactionId,
      recurringRuleId: only.ruleId
    };
  }
  if (exact.length > 1) {
    return {
      outcome: "ambiguous",
      candidateTransactionIds: exact.map((candidate) => candidate.transactionId)
    };
  }

  if (sameWindow.length > 0) {
    return {
      outcome: "amount_mismatch",
      candidateTransactionIds: sameWindow.map((candidate) => candidate.transactionId)
    };
  }

  return { outcome: "no_match" };
}
