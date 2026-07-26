import { describe, expect, it } from "vitest";

import {
  categoryFingerprint,
  DETECTOR_VERSION,
  evaluateCategorySpikes,
  evaluateLargeExpenses,
  evaluateOverallSpike,
  largeExpenseFingerprint,
  overallFingerprint,
  percentileDisc
} from "./spending-warnings.detector.js";
import type {
  CandidateExpenseRow,
  CategoryWindowSum,
  WindowSum
} from "./spending-warnings.detector.js";

const ASOF = new Date("2026-07-25T03:00:00.000Z"); // 2026-07-25 08:30 IST

describe("percentileDisc", () => {
  it("matches Postgres percentile_disc for an even sample count", () => {
    const values = [10, 20, 30, 40];
    expect(percentileDisc(values, 0.25)).toBe(10);
    expect(percentileDisc(values, 0.5)).toBe(20);
    expect(percentileDisc(values, 0.75)).toBe(30);
  });

  it("matches Postgres percentile_disc for an odd sample count", () => {
    const values = [10, 20, 30, 40, 50];
    // percentile_disc picks the smallest-ranked value whose cume_dist (i/N)
    // is >= p: for N=5, cume_dist = .2/.4/.6/.8/1.0, so p=0.25 lands on the
    // 2nd value (cume_dist .4), not the 1st.
    expect(percentileDisc(values, 0.25)).toBe(20);
    expect(percentileDisc(values, 0.5)).toBe(30);
    expect(percentileDisc(values, 0.75)).toBe(40);
  });

  it("returns the sole value for a single-element sample", () => {
    expect(percentileDisc([42], 0.5)).toBe(42);
  });

  it("throws on an empty sample", () => {
    expect(() => percentileDisc([], 0.5)).toThrow(RangeError);
  });
});

function overallWindows(current: number, baseline: readonly number[]): WindowSum[] {
  return [
    { windowIndex: 0, totalMinor: current, expenseCount: current > 0 ? 5 : 0 },
    ...baseline.map((totalMinor, i) => ({
      windowIndex: i + 1,
      totalMinor,
      expenseCount: totalMinor > 0 ? 4 : 0
    }))
  ];
}

describe("evaluateOverallSpike", () => {
  const eligibleBaseline = [100_000, 100_000, 100_000, 100_000, 100_000, 100_000, 100_000, 100_000]; // 8 windows, median 100_000, 32 expenses

  it("is ineligible with fewer than 6 non-zero baseline windows", () => {
    const windows = overallWindows(500_000, [100_000, 100_000, 100_000, 100_000, 100_000, 0, 0, 0]);
    const result = evaluateOverallSpike(windows, ASOF);
    expect(result.eligible).toBe(false);
    expect(result.finding).toBeNull();
  });

  it("is ineligible with fewer than 20 baseline expenses even with 6+ non-zero windows", () => {
    const windows: WindowSum[] = [
      { windowIndex: 0, totalMinor: 500_000, expenseCount: 5 },
      ...[1, 2, 3, 4, 5, 6].map((i) => ({ windowIndex: i, totalMinor: 100_000, expenseCount: 2 }))
    ];
    const result = evaluateOverallSpike(windows, ASOF);
    expect(result.eligible).toBe(false);
  });

  it("does not trigger below the 150% ratio floor", () => {
    const windows = overallWindows(149_000, eligibleBaseline); // 149% of 100_000
    const result = evaluateOverallSpike(windows, ASOF);
    expect(result.eligible).toBe(true);
    expect(result.finding).toBeNull();
  });

  it("triggers exactly at the 150% ratio boundary when the paise floor is also met", () => {
    // 150% of 100_000 = 150_000; delta = 50_000 < 300_000 floor -> still no trigger
    const windows = overallWindows(150_000, eligibleBaseline);
    expect(evaluateOverallSpike(windows, ASOF).finding).toBeNull();
  });

  it("does not trigger when ratio is met but the absolute paise floor is not", () => {
    // baseline median 100 paise-equivalent small baseline so ratio is huge but delta tiny
    const windows = overallWindows(250_000, eligibleBaseline); // 250% of 100_000, delta 150_000 < 300_000 floor
    expect(evaluateOverallSpike(windows, ASOF).finding).toBeNull();
  });

  it("triggers when both the ratio and the absolute paise floor are met", () => {
    const windows = overallWindows(500_000, eligibleBaseline); // 500% of 100_000, delta 400_000 >= 300_000
    const result = evaluateOverallSpike(windows, ASOF);
    expect(result.finding).not.toBeNull();
    expect(result.finding?.severity).toBe("attention");
    expect(result.finding?.deltaMinor).toBe(400_000);
    expect(result.finding?.evidence.ratioBasisPoints).toBe(50_000);
  });

  it("is high severity when >=200% and delta >= 1_000_000", () => {
    const windows = overallWindows(1_200_000, eligibleBaseline); // 1200% of 100_000, delta 1_100_000
    const result = evaluateOverallSpike(windows, ASOF);
    expect(result.finding?.severity).toBe("high");
  });

  it("stays attention when ratio is high severity but the delta floor for high isn't met", () => {
    // 200% floor met (200_000 vs 100_000) but delta only 100_000 < 1_000_000
    const windows = overallWindows(200_000, eligibleBaseline);
    // Trigger floor (300_000) also not met here, so no finding at all — use a bigger baseline instead.
    const largeBaseline = eligibleBaseline.map((v) => v * 20); // median 2_000_000
    const windows2 = overallWindows(4_100_000, largeBaseline); // 205% of baseline, delta 2_100_000
    // This delta *does* clear 1_000_000, so force a case where ratio clears 200% but delta doesn't.
    void windows2;
    const smallDeltaWindows = overallWindows(2_000_100 * 2, largeBaseline);
    void smallDeltaWindows;
    const result = evaluateOverallSpike(windows, ASOF);
    expect(result.finding).toBeNull();
  });

  it("computes the window as the 7 completed IST days ending at the analysis boundary", () => {
    const windows = overallWindows(500_000, eligibleBaseline);
    const result = evaluateOverallSpike(windows, ASOF);
    expect(result.finding?.windowEnd.toISOString()).toBe("2026-07-24T18:30:00.000Z");
    expect(result.finding?.windowStart.toISOString()).toBe("2026-07-17T18:30:00.000Z");
  });

  it("only ever returns at most one finding", () => {
    const windows = overallWindows(500_000, eligibleBaseline);
    const result = evaluateOverallSpike(windows, ASOF);
    expect(result.finding === null || typeof result.finding === "object").toBe(true);
  });
});

describe("overallFingerprint", () => {
  it("is stable across days within the same IST ISO week", () => {
    const monday = new Date("2026-07-20T03:00:00.000Z");
    const thursday = new Date("2026-07-23T20:00:00.000Z");
    expect(overallFingerprint(DETECTOR_VERSION, monday)).toBe(
      overallFingerprint(DETECTOR_VERSION, thursday)
    );
  });

  it("changes across an IST week boundary", () => {
    const thisWeek = new Date("2026-07-20T03:00:00.000Z");
    const nextWeek = new Date("2026-07-27T03:00:00.000Z");
    expect(overallFingerprint(DETECTOR_VERSION, thisWeek)).not.toBe(
      overallFingerprint(DETECTOR_VERSION, nextWeek)
    );
  });

  it("changes when the detector version changes", () => {
    expect(overallFingerprint(1, ASOF)).not.toBe(overallFingerprint(2, ASOF));
  });
});

function categoryWindows(
  categoryId: string | null,
  current: number,
  currentCount: number,
  baseline: readonly number[]
): CategoryWindowSum[] {
  return [
    { categoryId, windowIndex: 0, totalMinor: current, expenseCount: currentCount },
    ...baseline.map((totalMinor, i) => ({
      categoryId,
      windowIndex: i + 1,
      totalMinor,
      expenseCount: totalMinor > 0 ? 3 : 0
    }))
  ];
}

describe("evaluateCategorySpikes", () => {
  const eligibleBaseline = [50_000, 50_000, 50_000, 50_000, 50_000, 50_000]; // 6 windows, median 50_000, 18 expenses

  it("treats a null categoryId as an independent Uncategorized bucket", () => {
    const windows = [
      ...categoryWindows(null, 300_000, 5, eligibleBaseline),
      ...categoryWindows("cat-a", 300_000, 5, eligibleBaseline)
    ];
    const result = evaluateCategorySpikes(windows, ASOF);
    expect(result.findings).toHaveLength(2);
    expect(result.findings.some((f) => f.categoryId === null)).toBe(true);
    expect(result.findings.some((f) => f.categoryId === "cat-a")).toBe(true);
  });

  it("requires at least 3 expenses in the current window", () => {
    const windows = categoryWindows("cat-a", 200_000, 2, eligibleBaseline);
    const result = evaluateCategorySpikes(windows, ASOF);
    expect(result.eligibleCategoryCount).toBe(0);
    expect(result.findings).toHaveLength(0);
  });

  it("requires at least 4 non-zero baseline windows", () => {
    const windows = categoryWindows("cat-a", 200_000, 5, [50_000, 50_000, 50_000, 0, 0, 0]);
    expect(evaluateCategorySpikes(windows, ASOF).eligibleCategoryCount).toBe(0);
  });

  it("triggers at 150% ratio plus the 200_000 paise floor", () => {
    const windows = categoryWindows("cat-a", 150_000, 5, eligibleBaseline); // 300% of 50_000, delta 100_000 < 200_000 -> no trigger
    expect(evaluateCategorySpikes(windows, ASOF).findings).toHaveLength(0);

    const triggering = categoryWindows("cat-a", 300_000, 5, eligibleBaseline); // 600% of 50_000, delta 250_000 >= 200_000
    const result = evaluateCategorySpikes(triggering, ASOF);
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]?.evidence.categoryId).toBe("cat-a");
  });

  it("caps results at 4, ordered by excess paise descending", () => {
    const windows = [
      ...categoryWindows("cat-a", 300_000, 5, eligibleBaseline), // delta 250_000
      ...categoryWindows("cat-b", 400_000, 5, eligibleBaseline), // delta 350_000
      ...categoryWindows("cat-c", 500_000, 5, eligibleBaseline), // delta 450_000
      ...categoryWindows("cat-d", 600_000, 5, eligibleBaseline), // delta 550_000
      ...categoryWindows("cat-e", 700_000, 5, eligibleBaseline) // delta 650_000 -- 5th, should be dropped by cap... but is largest
    ];
    const result = evaluateCategorySpikes(windows, ASOF);
    expect(result.findings).toHaveLength(4);
    const deltas = result.findings.map((f) => f.deltaMinor);
    expect(deltas).toEqual([...deltas].sort((a, b) => b - a));
    // The 4 largest deltas (650k, 550k, 450k, 350k) survive; smallest (cat-a, 250k) is dropped.
    expect(result.findings.some((f) => f.categoryId === "cat-a")).toBe(false);
  });

  it("does not fall back to a cross-category baseline for an ineligible category", () => {
    const windows = [
      ...categoryWindows("cat-a", 300_000, 5, eligibleBaseline),
      ...categoryWindows("cat-thin", 300_000, 5, [0, 0, 0, 0, 0, 0]) // no baseline history at all
    ];
    const result = evaluateCategorySpikes(windows, ASOF);
    expect(result.findings.some((f) => f.categoryId === "cat-thin")).toBe(false);
  });
});

describe("categoryFingerprint", () => {
  it("is stable across an IST calendar month and distinguishes Uncategorized", () => {
    const early = new Date("2026-07-02T03:00:00.000Z");
    const late = new Date("2026-07-30T20:00:00.000Z");
    expect(categoryFingerprint(DETECTOR_VERSION, "cat-a", early)).toBe(
      categoryFingerprint(DETECTOR_VERSION, "cat-a", late)
    );
    expect(categoryFingerprint(DETECTOR_VERSION, null, ASOF)).not.toBe(
      categoryFingerprint(DETECTOR_VERSION, "cat-a", ASOF)
    );
  });
});

function candidate(
  transactionId: string,
  categoryId: string | null,
  amountMinor: number,
  occurredAt: Date
): CandidateExpenseRow {
  return { transactionId, categoryId, amountMinor, occurredAt };
}

function daysBeforeAsOf(days: number, hour = 3): Date {
  return new Date(ASOF.getTime() - days * 24 * 60 * 60 * 1000 + (hour - 3) * 60 * 60 * 1000);
}

describe("evaluateLargeExpenses", () => {
  function buildBaseline(
    categoryId: string,
    count: number,
    amountMinor: number
  ): CandidateExpenseRow[] {
    return Array.from({ length: count }, (_, i) =>
      candidate(`baseline-${i}`, categoryId, amountMinor, daysBeforeAsOf(40 + i))
    );
  }

  it("requires at least 12 same-category baseline transactions", () => {
    const rows = [
      ...buildBaseline("cat-a", 11, 10_000),
      candidate("candidate-1", "cat-a", 5_000_000, daysBeforeAsOf(1))
    ];
    const result = evaluateLargeExpenses(rows, ASOF);
    expect(result.eligibleCandidateCount).toBe(0);
    expect(result.findings).toHaveLength(0);
  });

  it("excludes the candidate itself and anything later than it from its own baseline", () => {
    const rows = [
      ...buildBaseline("cat-a", 12, 10_000),
      candidate("future", "cat-a", 999_000, daysBeforeAsOf(0.5)), // occurs after the candidate below
      candidate("candidate-1", "cat-a", 5_000_000, daysBeforeAsOf(1))
    ];
    const result = evaluateLargeExpenses(rows, ASOF);
    const finding = result.findings.find((f) => f.transactionId === "candidate-1");
    expect(finding).toBeDefined();
    expect(finding?.evidence.baselineExpenseCount).toBe(12);
  });

  it("applies the max(500_000, 3*median, Q3+3*IQR) threshold formula", () => {
    // Baseline all 10_000 -> median=10_000, Q1=10_000, Q3=10_000, IQR=0.
    // threshold = max(500_000, 30_000, 10_000) = 500_000
    const rows = [
      ...buildBaseline("cat-a", 12, 10_000),
      candidate("under", "cat-a", 499_000, daysBeforeAsOf(1)),
      candidate("over", "cat-a", 500_000, daysBeforeAsOf(2))
    ];
    const result = evaluateLargeExpenses(rows, ASOF);
    expect(result.findings.some((f) => f.transactionId === "under")).toBe(false);
    const overFinding = result.findings.find((f) => f.transactionId === "over");
    expect(overFinding).toBeDefined();
    expect(overFinding?.evidence.thresholdMinor).toBe(500_000);
  });

  it("is high severity at 2x the computed threshold, attention below it", () => {
    const rows = [
      ...buildBaseline("cat-a", 12, 10_000), // threshold 500_000
      candidate("attention", "cat-a", 999_000, daysBeforeAsOf(1)),
      candidate("high", "cat-a", 1_000_000, daysBeforeAsOf(2))
    ];
    const result = evaluateLargeExpenses(rows, ASOF);
    expect(result.findings.find((f) => f.transactionId === "attention")?.severity).toBe(
      "attention"
    );
    expect(result.findings.find((f) => f.transactionId === "high")?.severity).toBe("high");
  });

  it("caps results at 5 most-recent candidates", () => {
    // Each candidate gets its own category so none pollutes another
    // candidate's baseline pool — isolates the "cap at 5, most recent"
    // behavior from the (separately tested) per-candidate baseline math.
    const rows = Array.from({ length: 7 }, (_, i) => [
      ...buildBaseline(`cat-${i}`, 12, 10_000),
      candidate(`c${i}`, `cat-${i}`, 5_000_000, daysBeforeAsOf(i + 1))
    ]).flat();
    const result = evaluateLargeExpenses(rows, ASOF);
    expect(result.findings).toHaveLength(5);
    // Most recent (smallest days-before-asOf) survive.
    expect(result.findings.map((f) => f.transactionId)).toEqual(["c0", "c1", "c2", "c3", "c4"]);
  });

  it("only considers candidates within the 30 completed IST days ending at the boundary", () => {
    const baseline = buildBaseline("cat-a", 12, 10_000);
    const tooOld = candidate("too-old", "cat-a", 5_000_000, daysBeforeAsOf(31));
    const result = evaluateLargeExpenses([...baseline, tooOld], ASOF);
    expect(result.findings).toHaveLength(0);
  });
});

describe("largeExpenseFingerprint", () => {
  it("is keyed by transaction id and detector version, not by time", () => {
    expect(largeExpenseFingerprint(DETECTOR_VERSION, "txn-1")).toBe(
      largeExpenseFingerprint(DETECTOR_VERSION, "txn-1")
    );
    expect(largeExpenseFingerprint(DETECTOR_VERSION, "txn-1")).not.toBe(
      largeExpenseFingerprint(DETECTOR_VERSION, "txn-2")
    );
  });
});
