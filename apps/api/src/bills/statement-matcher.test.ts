import { TransactionSchema, type ParsedRow, type Transaction } from "@treasury-ops/shared";
import { describe, expect, it } from "vitest";

import { matchStatementRows } from "./statement-matcher.js";

const ACCOUNT_ID = "3fa85f64-5717-4562-b3fc-2c963f66beef";

function transaction(
  id: string,
  occurredAt: string,
  amountMinor: number,
  type: "expense" | "income" = "expense",
  description: string = "Fixture"
): Transaction {
  return TransactionSchema.parse({
    id,
    userId: "user-a",
    accountId: ACCOUNT_ID,
    type,
    amountMinor,
    occurredAt,
    description,
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

function parsed(
  occurredAt: string,
  amountMinor: number,
  type: "expense" | "income",
  description: string = "Statement fixture"
): ParsedRow {
  return { occurredAt: new Date(occurredAt), amountMinor, type, description };
}

describe("matchStatementRows", () => {
  it("matches a unique same-day amount and direction", () => {
    const result = matchStatementRows(
      [{ rowNumber: 1, parsed: parsed("2026-07-10T00:00:00.000Z", 5_000, "expense") }],
      [transaction("11111111-1111-4111-8111-111111111111", "2026-07-10T00:00:00.000Z", 5_000)]
    );
    expect(result).toMatchObject([
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

  it("uses a global assignment to preserve two text-supported matches", () => {
    const result = matchStatementRows(
      [
        {
          rowNumber: 1,
          parsed: parsed(
            "2026-07-10T00:00:00.000Z",
            5_000,
            "expense",
            "UPI/P2M/111111111111/ALPHA MARKET/ORDER 42"
          )
        },
        {
          rowNumber: 2,
          parsed: parsed(
            "2026-07-11T00:00:00.000Z",
            5_000,
            "expense",
            "UPI/P2M/222222222222/BETA CAFE/ORDER 11"
          )
        }
      ],
      [
        transaction(
          "11111111-1111-4111-8111-111111111111",
          "2026-07-11T00:00:00.000Z",
          5_000,
          "expense",
          "UPI/P2M/333333333333/BETA CAFE"
        ),
        transaction(
          "22222222-2222-4222-8222-222222222222",
          "2026-07-10T00:00:00.000Z",
          5_000,
          "expense",
          "UPI/P2M/444444444444/ALPHA MARKET"
        )
      ]
    );
    expect(result).toMatchObject([
      {
        rowNumber: 1,
        matchStatus: "matched",
        matchedTransactionId: "22222222-2222-4222-8222-222222222222"
      },
      {
        rowNumber: 2,
        matchStatus: "matched",
        matchedTransactionId: "11111111-1111-4111-8111-111111111111"
      }
    ]);
    expect(result.every((row) => row.matchSuggestion?.method === "global_assignment_v1")).toBe(
      true
    );
  });

  it("abstains when equal-cost assignments have no global margin", () => {
    const result = matchStatementRows(
      [
        { rowNumber: 1, parsed: parsed("2026-07-10T00:00:00.000Z", 5_000, "expense", "Cafe") },
        { rowNumber: 2, parsed: parsed("2026-07-10T00:00:00.000Z", 5_000, "expense", "Cafe") }
      ],
      [
        transaction(
          "11111111-1111-4111-8111-111111111111",
          "2026-07-10T00:00:00.000Z",
          5_000,
          "expense",
          "Cafe"
        ),
        transaction(
          "22222222-2222-4222-8222-222222222222",
          "2026-07-10T00:00:00.000Z",
          5_000,
          "expense",
          "Cafe"
        )
      ]
    );
    expect(result.map((row) => row.matchStatus)).toEqual(["ambiguous", "ambiguous"]);
    expect(result[0]?.matchSuggestion?.sufficiency).toMatchObject({
      status: "insufficient",
      reason: "ambiguous_assignment"
    });
  });

  it("uses a dummy assignment when compatible evidence is too weak", () => {
    const result = matchStatementRows(
      [{ rowNumber: 1, parsed: parsed("2026-07-10T00:00:00.000Z", 5_000, "expense", "Travel") }],
      [
        transaction(
          "11111111-1111-4111-8111-111111111111",
          "2026-07-11T00:00:00.000Z",
          5_000,
          "expense",
          "Groceries"
        )
      ]
    );
    expect(result[0]).toMatchObject({
      matchStatus: "missing_from_ledger",
      matchSuggestion: {
        sufficiency: { status: "insufficient", reason: "no_eligible_candidate" },
        evidence: { candidateCount: 1, selectedTransactionId: null }
      }
    });
  });

  it("abstains inside the documented row budget", () => {
    const rows = Array.from({ length: 51 }, (_, index) => ({
      rowNumber: index + 1,
      parsed: parsed("2026-07-10T00:00:00.000Z", 5_000, "expense")
    }));
    const result = matchStatementRows(rows, []);
    expect(result).toHaveLength(51);
    expect(result.every((row) => row.matchStatus === "ambiguous")).toBe(true);
    expect(result[0]?.matchSuggestion?.sufficiency).toMatchObject({
      status: "insufficient",
      reason: "resource_limit"
    });
  });

  it("is deterministic across concurrent worker attempts", async () => {
    const rows = [
      { rowNumber: 1, parsed: parsed("2026-07-10T00:00:00.000Z", 5_000, "expense", "Alpha") }
    ];
    const transactions = [
      transaction(
        "11111111-1111-4111-8111-111111111111",
        "2026-07-10T00:00:00.000Z",
        5_000,
        "expense",
        "Alpha"
      )
    ];
    const results = await Promise.all(
      Array.from({ length: 5 }, () => Promise.resolve(matchStatementRows(rows, transactions)))
    );
    expect(new Set(results.map((result) => JSON.stringify(result))).size).toBe(1);
  });
});
