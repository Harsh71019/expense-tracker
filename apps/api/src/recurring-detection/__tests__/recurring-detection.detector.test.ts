import { describe, expect, it } from "vitest";

import { classifyAmountBehavior } from "../amount-behavior.js";
import { detectCadence } from "../cadence-detector.js";
import { detectRecurringStreams } from "../detect-recurring-streams.js";
import type { TransactionInput } from "../detect-recurring-streams.js";
import { evaluateRecurringDetectionChronologically } from "../recurring-detection.evaluation.js";
import type { LabeledRecurrencePoint } from "../recurring-detection.evaluation.js";
import { groupTransactionsForRecurrence } from "../stream-grouping.js";

const USER_ID = "recurrence-user";

describe("recurring cadence detection", () => {
  it.each([
    ["weekly", ["2026-01-02", "2026-01-09", "2026-01-16"]],
    ["biweekly", ["2026-01-02", "2026-01-16", "2026-01-30"]],
    [
      "semimonthly",
      ["2026-01-01", "2026-01-15", "2026-02-01", "2026-02-15", "2026-03-01", "2026-03-15"]
    ],
    ["monthly", ["2026-01-31", "2026-02-28", "2026-03-31"]],
    ["quarterly", ["2025-07-31", "2025-10-31", "2026-01-31"]],
    ["annual", ["2025-02-28", "2026-02-28"]]
  ] as const)("selects %s with calendar-aware alignment", (cadence, dates) => {
    expect(detectCadence(dates, dates.at(-1) ?? "2026-01-01").bestCadence).toBe(cadence);
  });

  it("retains a monthly cadence when one expected period is missing", () => {
    const result = detectCadence(["2026-01-15", "2026-02-15", "2026-04-15"], "2026-04-15");
    expect(result.bestCadence).toBe("monthly");
    expect(result.bestScore?.coverageBps).toBe(7_500);
  });

  it("allows bounded working-day shifts in a monthly salary", () => {
    const result = detectCadence(
      ["2026-01-30", "2026-02-27", "2026-03-30", "2026-04-30"],
      "2026-04-30"
    );
    expect(result.bestCadence).toBe("monthly");
    expect(result.bestScore?.dateStabilityBps).toBeGreaterThanOrEqual(8_000);
  });

  it("abstains when biweekly and semimonthly evidence is tied", () => {
    expect(detectCadence(["2026-01-01", "2026-01-15"], "2026-01-15")).toMatchObject({
      bestCadence: null,
      ambiguous: true
    });
  });
});

describe("recurring grouping and amount behavior", () => {
  it("separates inflows from outflows and clearly different amount clusters", () => {
    const grouped = groupTransactionsForRecurrence([
      groupingTxn("expense-a", "expense", 99_900, "2026-01-01"),
      groupingTxn("expense-b", "expense", 100_000, "2026-02-01"),
      groupingTxn("expense-large-a", "expense", 1_000_000, "2026-01-10"),
      groupingTxn("expense-large-b", "expense", 1_010_000, "2026-02-10"),
      groupingTxn("income-a", "income", 100_000, "2026-01-01"),
      groupingTxn("income-b", "income", 100_000, "2026-02-01")
    ]);

    expect(grouped.groups).toHaveLength(3);
    expect(grouped.groups.filter((group) => group.transactionType === "expense")).toHaveLength(2);
    expect(grouped.groups.filter((group) => group.transactionType === "income")).toHaveLength(1);
  });

  it("classifies stable subscriptions and variable utilities without rejecting variability", () => {
    expect(classifyAmountBehavior([99_900, 100_000, 100_100]).behavior).toBe("fixed");
    const variable = classifyAmountBehavior([80_000, 100_000, 140_000]);
    expect(variable.behavior).toBe("variable");
    expect(variable.stabilityBps).toBeGreaterThan(0);
  });
});

describe("pure recurring detector", () => {
  it("detects recurring inflows and outflows while keeping their memberships separate", () => {
    const transactions = [
      txn(1, "expense", 250_000, "2026-01-05", "NACH HOME RENT"),
      txn(2, "income", 500_000, "2026-01-07", "NEFT ACME SALARY"),
      txn(3, "expense", 250_000, "2026-02-05", "NACH HOME RENT"),
      txn(4, "income", 500_000, "2026-02-07", "NEFT ACME SALARY"),
      txn(5, "expense", 250_000, "2026-03-05", "NACH HOME RENT"),
      txn(6, "income", 500_000, "2026-03-07", "NEFT ACME SALARY")
    ];
    const result = detectRecurringStreams(transactions, USER_ID, instant("2026-03-07"));

    expect(result.summary.status).toBe("completed");
    expect(result.streams).toHaveLength(2);
    expect(result.streams.map((stream) => stream.transactionType).sort()).toEqual([
      "expense",
      "income"
    ]);
    for (const stream of result.streams) {
      expect(new Set(stream.members.map((member) => member.transactionId)).size).toBe(3);
      expect(stream.state).toBe("mature");
    }
  });

  it("marks insufficient history and does not invent a stream", () => {
    const result = detectRecurringStreams(
      [txn(1, "expense", 100_000, "2026-01-01", "NETFLIX")],
      USER_ID,
      instant("2026-01-01")
    );
    expect(result.summary.status).toBe("abstained");
    expect(result.summary.sufficiency).toMatchObject({
      status: "insufficient",
      reason: "insufficient_history"
    });
    expect(result.streams).toEqual([]);
  });

  it("ignores future-created, future-updated, and future-occurring rows at an as-of boundary", () => {
    const historical = [
      txn(1, "expense", 100_000, "2026-01-01", "NETFLIX"),
      txn(2, "expense", 100_000, "2026-02-01", "NETFLIX"),
      txn(3, "expense", 100_000, "2026-03-01", "NETFLIX")
    ];
    const future = txn(4, "expense", 900_000, "2026-04-01", "NETFLIX");
    const futureUpdated = {
      ...txn(5, "expense", 900_000, "2026-03-15", "NETFLIX"),
      updatedAt: instant("2026-04-01")
    };
    const asOf = instant("2026-03-31");
    const withoutFuture = detectRecurringStreams(historical, USER_ID, asOf);
    const withFuture = detectRecurringStreams(
      [...historical, future, futureUpdated],
      USER_ID,
      asOf
    );

    expect(withFuture.summary.inputWatermark).toEqual(withoutFuture.summary.inputWatermark);
    expect(withFuture.streams).toEqual(withoutFuture.streams);
  });

  it("records ambiguous candidates as an explicit abstention", () => {
    const result = detectRecurringStreams(
      [
        txn(1, "expense", 100_000, "2026-01-01", "ACME SERVICE"),
        txn(2, "expense", 100_000, "2026-01-15", "ACME SERVICE")
      ],
      USER_ID,
      instant("2026-01-15")
    );

    expect(result.streams).toEqual([]);
    expect(result.summary.abstentionCounts.ambiguous_cadence).toBe(1);
  });

  it("rejects cross-tenant inputs even in the pure boundary", () => {
    const otherTenant = { ...txn(1, "expense", 100_000, "2026-01-01", "NETFLIX"), userId: "other" };
    expect(() =>
      detectRecurringStreams(
        [otherTenant, txn(2, "expense", 100_000, "2026-02-01", "NETFLIX")],
        USER_ID,
        instant("2026-02-01")
      )
    ).toThrow("another tenant");
  });

  it("returns explicit degraded outcomes for row and runtime ceilings", () => {
    const inputs = [
      txn(1, "expense", 100_000, "2026-01-01", "NETFLIX"),
      txn(2, "expense", 100_000, "2026-02-01", "NETFLIX"),
      txn(3, "expense", 100_000, "2026-03-01", "NETFLIX")
    ];
    expect(
      detectRecurringStreams(inputs, USER_ID, instant("2026-03-01"), { rowBudgetHit: true }).summary
    ).toMatchObject({ status: "degraded", resources: { rowBudgetHit: true } });

    let clockValue = 0;
    const timedOut = detectRecurringStreams(inputs, USER_ID, instant("2026-03-01"), {
      clock: () => {
        clockValue += 30_001;
        return clockValue;
      }
    });
    expect(timedOut.summary).toMatchObject({
      status: "degraded",
      resources: { timedOut: true }
    });
  });
});

describe("chronological recurring evaluation", () => {
  it("uses rolling origins and promotes only measured high-precision improvement", () => {
    const fixture: LabeledRecurrencePoint[] = [
      labeled(1, "2026-01-01", "ACME SALARY", "salary"),
      labeled(2, "2026-01-10", "CORNER SHOP", null),
      labeled(3, "2026-02-01", "ACME SALARY", "salary"),
      labeled(4, "2026-02-10", "LOCAL TAXI", null),
      labeled(5, "2026-03-01", "ACME SALARY", "salary"),
      labeled(6, "2026-03-10", "BOOK STORE", null),
      labeled(7, "2026-04-01", "ACME SALARY", "salary"),
      labeled(8, "2026-04-10", "CAFE", null),
      labeled(9, "2026-05-01", "ACME SALARY", "salary")
    ];

    const evaluation = evaluateRecurringDetectionChronologically(fixture, USER_ID);
    expect(evaluation.evaluatedOriginCount).toBeGreaterThanOrEqual(4);
    expect(
      evaluation.promotion.candidateMetrics.matureStreamDecision.truePositiveCount
    ).toBeGreaterThan(0);
    expect(evaluation.promotion).toMatchObject({ eligible: true, reason: "improved" });
  });
});

function groupingTxn(
  id: string,
  type: "expense" | "income",
  amountMinor: number,
  occurredAt: string
): {
  id: string;
  type: "expense" | "income";
  description: string;
  amountMinor: number;
  occurredAt: string;
} {
  return { id, type, description: "UPI ACME SERVICES", amountMinor, occurredAt };
}

function txn(
  index: number,
  type: "expense" | "income",
  amountMinor: number,
  date: string,
  description: string
): TransactionInput {
  const occurredAt = instant(date);
  return {
    id: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
    userId: USER_ID,
    type,
    amountMinor,
    description,
    occurredAt,
    createdAt: occurredAt,
    updatedAt: occurredAt
  };
}

function labeled(
  index: number,
  date: string,
  description: string,
  truthStreamKey: string | null
): LabeledRecurrencePoint {
  return {
    transaction: txn(
      index,
      truthStreamKey === "salary" ? "income" : "expense",
      500_000,
      date,
      description
    ),
    truthStreamKey
  };
}

function instant(date: string): Date {
  return new Date(`${date}T12:00:00.000Z`);
}
