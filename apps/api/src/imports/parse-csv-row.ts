import type { ColumnMapping, ParsedRow } from "@treasury-ops/shared";

import { parseExplicitDate } from "../common/time/parse-date.js";
import { resolveAmount } from "./parse-amount.js";

export type RowParseResult = Readonly<{ parsed?: ParsedRow; problems: readonly string[] }>;

/**
 * Parses one raw CSV row into a ParsedRow, or a list of per-row problems.
 * Never throws — a malformed row is staged with its problems for the user
 * to see in preview, not a reason to fail the whole batch.
 */
export function parseCsvRow(raw: Record<string, string>, mapping: ColumnMapping): RowParseResult {
  const problems: string[] = [];

  let occurredAt: Date | undefined;
  try {
    occurredAt = parseExplicitDate(requireCell(raw, mapping.date), mapping.dateFormat);
  } catch (error) {
    problems.push(messageOf(error));
  }

  let amount: { amountMinor: number; type: ParsedRow["type"] } | undefined;
  try {
    amount = resolveAmount(raw, mapping);
  } catch (error) {
    problems.push(messageOf(error));
  }

  let description: string | undefined;
  try {
    description = requireCell(raw, mapping.description).trim();
  } catch (error) {
    problems.push(messageOf(error));
  }

  if (occurredAt === undefined || amount === undefined || description === undefined) {
    return { problems };
  }

  return {
    parsed: { occurredAt, amountMinor: amount.amountMinor, type: amount.type, description },
    problems
  };
}

function requireCell(raw: Record<string, string>, column: string): string {
  const value = raw[column];
  if (value === undefined || value.trim() === "") {
    throw new RangeError(`Row is missing a value for column "${column}".`);
  }
  return value;
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown parse error.";
}
