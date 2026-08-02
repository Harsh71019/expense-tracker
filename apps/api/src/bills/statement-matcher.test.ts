import { TransactionSchema, type ParsedRow, type Transaction } from "@treasury-ops/shared";
import { describe, expect, it } from "vitest";

import { matchStatementRows } from "./statement-matcher.js";

const ACCOUNT_ID = "3fa85f64-5717-4562-b3fc-2c963f66beef";

function transaction(
  id: string,
  occurredAt: string,
  amountMinor: number,
  type: "expense" | "income" = "expense"
): Transaction {
  return TransactionSchema.parse({
    id,
    userId: "user-a",
    accountId: ACCOUNT_ID,
    type,
    amountMinor,
    occurredAt,
    description: "Fixture",
    tags: [],
    currency: "INR",
    source: "manual",
    status: "posted",
    paymentRail: "unknown",
    counterpartyHandle: null,
    createdAt: occurredAt,
    updatedAt: occurredAt
  });
}

function parsed(occurredAt: string, amountMinor: number, type: "expense" | "income"): ParsedRow {
  return { occurredAt: new Date(occurredAt), amountMinor, type, description: "Statement fixture" };
}

describe("matchStatementRows", () => {
  it("matches a unique same-day amount and direction", () => {
    const result = matchStatementRows(
      [{ rowNumber: 1, parsed: parsed("2026-07-10T00:00:00.000Z", 5_000, "expense") }],
      [transaction("11111111-1111-4111-8111-111111111111", "2026-07-10T00:00:00.000Z", 5_000)]
    );
    expect(result).toEqual([
      {
        rowNumber: 1,
        matchStatus: "matched",
        matchedTransactionId: "11111111-1111-4111-8111-111111111111"
      }
    ]);
  });

  it("prefers the closest date inside the one-day window", () => {
    const result = matchStatementRows(
      [{ rowNumber: 1, parsed: parsed("2026-07-10T00:00:00.000Z", 5_000, "expense") }],
      [
        transaction("11111111-1111-4111-8111-111111111111", "2026-07-09T00:00:00.000Z", 5_000),
        transaction("22222222-2222-4222-8222-222222222222", "2026-07-10T00:00:00.000Z", 5_000)
      ]
    );
    expect(result[0]?.matchedTransactionId).toBe("22222222-2222-4222-8222-222222222222");
  });

  it("marks tied candidates and shared duplicate rows ambiguous", () => {
    const candidate = transaction(
      "11111111-1111-4111-8111-111111111111",
      "2026-07-10T00:00:00.000Z",
      5_000
    );
    const same = parsed("2026-07-10T00:00:00.000Z", 5_000, "expense");
    expect(
      matchStatementRows(
        [
          { rowNumber: 1, parsed: same },
          { rowNumber: 2, parsed: same }
        ],
        [candidate]
      ).map((row) => row.matchStatus)
    ).toEqual(["ambiguous", "ambiguous"]);
  });

  it("does not match the wrong direction or a malformed row", () => {
    const result = matchStatementRows(
      [
        { rowNumber: 1, parsed: parsed("2026-07-10T00:00:00.000Z", 5_000, "income") },
        { rowNumber: 2 }
      ],
      [transaction("11111111-1111-4111-8111-111111111111", "2026-07-10T00:00:00.000Z", 5_000)]
    );
    expect(result.map((row) => row.matchStatus)).toEqual([
      "missing_from_ledger",
      "missing_from_ledger"
    ]);
  });
});
