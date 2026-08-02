import {
  calendarDayDistance,
  type RecurringRuleId,
  type TransactionId
} from "@treasury-ops/shared";

import { normalizeTransactionText } from "../common/transaction-text/normalize-transaction-text.js";

export const RECONCILIATION_WINDOW_DAYS = 3;

export type RecurringCandidate = Readonly<{
  transactionId: TransactionId;
  ruleId: RecurringRuleId;
  accountId: string;
  type: "expense" | "income";
  amountMinor: number;
  occurredAt: Date;
  templateDescription: string;
}>;

export type IncomingTransaction = Readonly<{
  accountId: string;
  type: "expense" | "income";
  amountMinor: number;
  occurredAt: Date;
  description: string;
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
 * True when both descriptions carry at least one identical reference token
 * (e.g. a bank's e-mandate/SI Hub ID embedded as `mandate:<id>`), per
 * normalizeTransactionText(). A stable per-subscription identifier like this
 * survives a price change, unlike amountMinor — see tier 0 below.
 */
function sharesReferenceToken(incomingDescription: string, candidateDescription: string): boolean {
  const incomingValues = new Set(
    normalizeTransactionText(incomingDescription).referenceTokens.map((token) => token.value)
  );
  if (incomingValues.size === 0) return false;
  return normalizeTransactionText(candidateDescription).referenceTokens.some((token) =>
    incomingValues.has(token.value)
  );
}

/**
 * Three-tier match, mirroring statement-matcher.ts's rank-then-classify
 * shape: tier 0 looks for a stable per-subscription reference token shared
 * between the incoming description and a candidate's recurring-rule
 * templateDescription (see sharesReferenceToken) — this beats amount
 * entirely, since a subscription price change shouldn't break the match.
 * Tier 1 requires an exact amount match (the common case — a recurring
 * template's amount and the real charge should agree); tier 2 only runs when
 * tiers 0 and 1 find nothing, and drops the amount filter to catch "same
 * account, same rough date, but the number is off" (price change, partial
 * charge) -- the case the user explicitly wants flagged rather than silently
 * ignored.
 */
export function matchIncomingTransaction(
  incoming: IncomingTransaction,
  candidates: readonly RecurringCandidate[]
): ReconciliationMatch {
  const sameAccountAndType = candidates.filter(
    (candidate) => candidate.accountId === incoming.accountId && candidate.type === incoming.type
  );

  const mandateMatches = sameAccountAndType.filter((candidate) =>
    sharesReferenceToken(incoming.description, candidate.templateDescription)
  );
  if (mandateMatches.length === 1) {
    const [only] = mandateMatches;
    if (only === undefined) throw new Error("unreachable: mandateMatches.length === 1");
    return {
      outcome: "auto_matched",
      recurringTransactionId: only.transactionId,
      recurringRuleId: only.ruleId
    };
  }
  if (mandateMatches.length > 1) {
    return {
      outcome: "ambiguous",
      candidateTransactionIds: mandateMatches.map((candidate) => candidate.transactionId)
    };
  }

  const sameWindow = sameAccountAndType.filter(
    (candidate) =>
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
