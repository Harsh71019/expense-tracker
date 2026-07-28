import {
  calendarDayDistance,
  type BillStatementRowMatchStatus,
  type ParsedRow,
  type Transaction
} from "@treasury-ops/shared";

export type StatementRowCandidate = Readonly<{
  rowNumber: number;
  parsed?: ParsedRow;
}>;

export type StatementRowMatch = Readonly<{
  rowNumber: number;
  matchStatus: BillStatementRowMatchStatus;
  matchedTransactionId?: string;
}>;

type Ranked = Readonly<{
  rowNumber: number;
  bestIds: readonly string[];
}>;

export function matchStatementRows(
  rows: readonly StatementRowCandidate[],
  transactions: readonly Transaction[]
): StatementRowMatch[] {
  const ranked: Ranked[] = rows.map((row) => rankRow(row, transactions));
  const bestUseCount = new Map<string, number>();
  for (const row of ranked) {
    for (const transactionId of row.bestIds) {
      bestUseCount.set(transactionId, (bestUseCount.get(transactionId) ?? 0) + 1);
    }
  }

  return ranked.map((row) => {
    const [only] = row.bestIds;
    if (only === undefined) {
      return { rowNumber: row.rowNumber, matchStatus: "missing_from_ledger" };
    }
    if (row.bestIds.length === 1 && bestUseCount.get(only) === 1) {
      return { rowNumber: row.rowNumber, matchStatus: "matched", matchedTransactionId: only };
    }
    return { rowNumber: row.rowNumber, matchStatus: "ambiguous" };
  });
}

function rankRow(row: StatementRowCandidate, transactions: readonly Transaction[]): Ranked {
  if (row.parsed === undefined) return { rowNumber: row.rowNumber, bestIds: [] };
  const parsed = row.parsed;
  const candidates = transactions
    .map((transaction) => ({
      transaction,
      distance: calendarDayDistance(transaction.occurredAt, parsed.occurredAt)
    }))
    .filter(
      ({ transaction, distance }) =>
        transaction.type === parsed.type &&
        transaction.amountMinor === parsed.amountMinor &&
        distance <= 1
    );
  const bestDistance = Math.min(...candidates.map((candidate) => candidate.distance));
  const bestIds = candidates
    .filter((candidate) => candidate.distance === bestDistance)
    .map((candidate) => candidate.transaction.id)
    .sort();
  return { rowNumber: row.rowNumber, bestIds };
}
