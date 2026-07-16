import { parseMinor } from "@vyaya/shared";
import type { ColumnMapping, TransactionType } from "@vyaya/shared";

export type AmountResolution = Readonly<{ amountMinor: number; type: TransactionType }>;

/**
 * Resolves a row's amount + transaction type per the mapping's
 * amountConvention (BACKEND.md §4: "support both single-signed-amount and
 * separate debit/credit column conventions"). Throws RangeError for
 * anything the caller should surface as a per-row "problem" rather than a
 * crash — a bad amount in row 4,000 of a 5,000-row statement shouldn't
 * abort staging the other 4,999.
 */
export function resolveAmount(
  raw: Record<string, string>,
  mapping: ColumnMapping
): AmountResolution {
  return mapping.amountConvention === "single_signed"
    ? resolveSingleSigned(raw, mapping)
    : resolveDebitCredit(raw, mapping);
}

function resolveSingleSigned(
  raw: Record<string, string>,
  mapping: ColumnMapping
): AmountResolution {
  const column = requireColumn(mapping.amount, "amount");
  const value = requireCell(raw, column).trim();
  const negative = value.startsWith("-");
  const magnitude = parseMinor(negative ? value.slice(1) : value);
  if (magnitude === 0) {
    throw new RangeError(`Amount in column "${column}" is zero.`);
  }
  return { amountMinor: magnitude, type: negative ? "expense" : "income" };
}

function resolveDebitCredit(raw: Record<string, string>, mapping: ColumnMapping): AmountResolution {
  const debitColumn = requireColumn(mapping.debit, "debit");
  const creditColumn = requireColumn(mapping.credit, "credit");
  const debitValue = (raw[debitColumn] ?? "").trim();
  const creditValue = (raw[creditColumn] ?? "").trim();
  const debitMinor = debitValue === "" ? 0 : parseMinor(debitValue);
  const creditMinor = creditValue === "" ? 0 : parseMinor(creditValue);

  if (debitMinor > 0 && creditMinor > 0) {
    throw new RangeError(
      `Both "${debitColumn}" and "${creditColumn}" have a value — ambiguous row.`
    );
  }
  if (debitMinor === 0 && creditMinor === 0) {
    throw new RangeError(`Neither "${debitColumn}" nor "${creditColumn}" has a value.`);
  }

  return debitMinor > 0
    ? { amountMinor: debitMinor, type: "expense" }
    : { amountMinor: creditMinor, type: "income" };
}

function requireColumn(column: string | undefined, label: string): string {
  if (column === undefined) {
    throw new Error(`Column mapping is missing its "${label}" column despite passing validation.`);
  }
  return column;
}

function requireCell(raw: Record<string, string>, column: string): string {
  const value = raw[column];
  if (value === undefined || value.trim() === "") {
    throw new RangeError(`Row is missing a value for column "${column}".`);
  }
  return value;
}
