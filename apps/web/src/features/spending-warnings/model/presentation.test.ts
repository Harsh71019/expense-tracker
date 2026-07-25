import type { SpendingWarning } from "@treasury-ops/shared";
import { describe, expect, it } from "vitest";

import {
  evidenceFacts,
  evidenceSummary,
  investigationHref,
  investigationLinkLabel,
  percentAboveBaseline,
  severityLabel,
  warningKindLabel,
  warningTitle,
  windowDays
} from "./presentation";

const baseTimestamps = {
  detectorVersion: 1,
  firstDetectedAt: new Date("2026-07-24T02:00:00.000Z"),
  lastDetectedAt: new Date("2026-07-24T02:00:00.000Z")
};

const overallWarning: SpendingWarning = {
  id: "3fa85f64-5717-4562-b3fc-2c963f66be01",
  userId: "user-1",
  fingerprint: "v1:overall_spend_spike:2026-07-20",
  kind: "overall_spend_spike",
  severity: "attention",
  status: "active",
  windowStart: new Date("2026-07-17T00:00:00.000Z"),
  windowEnd: new Date("2026-07-24T00:00:00.000Z"),
  evidence: {
    kind: "overall_spend_spike",
    currentMinor: 1_240_000,
    baselineMedianMinor: 738_000,
    deltaMinor: 502_000,
    ratioBasisPoints: 16_802,
    windowStart: new Date("2026-07-17T00:00:00.000Z"),
    windowEnd: new Date("2026-07-24T00:00:00.000Z"),
    baselineWindowCount: 8,
    baselineExpenseCount: 46
  },
  ...baseTimestamps
};

const categoryWarning: SpendingWarning = {
  id: "3fa85f64-5717-4562-b3fc-2c963f66be02",
  userId: "user-1",
  fingerprint: "v1:category_spend_spike:cat-1:2026-07",
  kind: "category_spend_spike",
  severity: "high",
  status: "active",
  categoryId: "3fa85f64-5717-4562-b3fc-2c963f66bc01",
  windowStart: new Date("2026-06-24T00:00:00.000Z"),
  windowEnd: new Date("2026-07-24T00:00:00.000Z"),
  evidence: {
    kind: "category_spend_spike",
    categoryId: "3fa85f64-5717-4562-b3fc-2c963f66bc01",
    categoryName: "Dining",
    currentMinor: 480_000,
    baselineMedianMinor: 210_000,
    deltaMinor: 270_000,
    ratioBasisPoints: 22_857,
    windowStart: new Date("2026-06-24T00:00:00.000Z"),
    windowEnd: new Date("2026-07-24T00:00:00.000Z"),
    baselineWindowCount: 6,
    baselineExpenseCount: 30,
    currentExpenseCount: 9
  },
  ...baseTimestamps
};

const largeExpenseWarning: SpendingWarning = {
  id: "3fa85f64-5717-4562-b3fc-2c963f66be03",
  userId: "user-1",
  fingerprint: "v1:unusually_large_expense:txn-1",
  kind: "unusually_large_expense",
  severity: "attention",
  status: "active",
  categoryId: "3fa85f64-5717-4562-b3fc-2c963f66bc02",
  transactionId: "3fa85f64-5717-4562-b3fc-2c963f66bd01",
  windowStart: new Date("2026-01-25T00:00:00.000Z"),
  windowEnd: new Date("2026-07-24T00:00:00.000Z"),
  evidence: {
    kind: "unusually_large_expense",
    transactionId: "3fa85f64-5717-4562-b3fc-2c963f66bd01",
    categoryId: "3fa85f64-5717-4562-b3fc-2c963f66bc02",
    categoryName: "Travel",
    amountMinor: 950_000,
    thresholdMinor: 500_000,
    baselineMedianMinor: 180_000,
    baselineQ1Minor: 120_000,
    baselineQ3Minor: 250_000,
    baselineExpenseCount: 18,
    occurredAt: new Date("2026-07-24T00:00:00.000Z")
  },
  ...baseTimestamps
};

describe("windowDays", () => {
  it("rounds to whole days", () => {
    expect(windowDays(overallWarning.windowStart, overallWarning.windowEnd)).toBe(7);
    expect(windowDays(categoryWarning.windowStart, categoryWarning.windowEnd)).toBe(30);
  });
});

describe("percentAboveBaseline", () => {
  it("converts integer basis points to a percent-above figure without recomputing the ratio", () => {
    expect(percentAboveBaseline(16_802)).toBe(68);
    expect(percentAboveBaseline(10_000)).toBe(0);
    expect(percentAboveBaseline(20_000)).toBe(100);
  });
});

describe("evidenceSummary", () => {
  it("summarizes an overall spend spike", () => {
    expect(evidenceSummary(overallWarning)).toBe(
      "₹12,400.00 in the last 7 days, 68% above your recent weekly median of ₹7,380.00."
    );
  });

  it("summarizes a category spend spike", () => {
    expect(evidenceSummary(categoryWarning)).toBe(
      "Dining was ₹4,800.00 in 30 days, compared with a recent median of ₹2,100.00."
    );
  });

  it("summarizes an unusually large expense, pluralizing the expense count", () => {
    expect(evidenceSummary(largeExpenseWarning)).toBe(
      "₹9,500.00 is above your usual range for Travel, based on 18 earlier expenses."
    );
  });

  it("singularizes a one-expense baseline", () => {
    const warning: SpendingWarning = {
      ...largeExpenseWarning,
      evidence: { ...largeExpenseWarning.evidence, baselineExpenseCount: 1 }
    };
    expect(evidenceSummary(warning)).toContain("based on 1 earlier expense.");
  });

  it("falls back to generic category text when categoryName is absent", () => {
    const warning: SpendingWarning = {
      ...categoryWarning,
      categoryId: undefined,
      evidence: {
        kind: "category_spend_spike",
        currentMinor: 480_000,
        baselineMedianMinor: 210_000,
        deltaMinor: 270_000,
        ratioBasisPoints: 22_857,
        windowStart: categoryWarning.windowStart,
        windowEnd: categoryWarning.windowEnd,
        baselineWindowCount: 6,
        baselineExpenseCount: 30,
        currentExpenseCount: 9
      }
    };
    expect(evidenceSummary(warning)).toContain("Uncategorized was");
  });
});

describe("evidenceFacts", () => {
  it("returns money and range facts for a large expense", () => {
    const facts = evidenceFacts(largeExpenseWarning);
    expect(facts).toContainEqual({ kind: "money", label: "This expense", minor: 950_000 });
    expect(facts).toContainEqual({
      kind: "range",
      label: "Usual range",
      fromMinor: 120_000,
      toMinor: 250_000
    });
  });

  it("includes a percent-change text fact for spikes", () => {
    const facts = evidenceFacts(overallWarning);
    expect(facts).toContainEqual({ kind: "text", label: "Change", value: "+68%" });
  });
});

describe("warningTitle / warningKindLabel / severityLabel", () => {
  it("labels each kind distinctly", () => {
    expect(warningKindLabel("overall_spend_spike")).toBe("Overall spike");
    expect(warningKindLabel("category_spend_spike")).toBe("Category spike");
    expect(warningKindLabel("unusually_large_expense")).toBe("Large expense");
  });

  it("titles each kind using category names where relevant", () => {
    expect(warningTitle(overallWarning)).toBe("Overall spending spike");
    expect(warningTitle(categoryWarning)).toBe("Dining spending spike");
    expect(warningTitle(largeExpenseWarning)).toBe("Unusually large Travel expense");
  });

  it("uses neutral severity labels, never raw enum text", () => {
    expect(severityLabel("attention")).toBe("Needs attention");
    expect(severityLabel("high")).toBe("High variation");
  });
});

describe("investigationHref", () => {
  it("links an overall spike to the transactions list scoped by window", () => {
    expect(investigationHref(overallWarning)).toBe(
      "/transactions?from=2026-07-17T00%3A00%3A00.000Z&to=2026-07-24T00%3A00%3A00.000Z"
    );
  });

  it("links a category spike to the transactions list with categoryId and window", () => {
    expect(investigationHref(categoryWarning)).toBe(
      "/transactions?categoryId=3fa85f64-5717-4562-b3fc-2c963f66bc01&from=2026-06-24T00%3A00%3A00.000Z&to=2026-07-24T00%3A00%3A00.000Z"
    );
  });

  it("links a large expense straight to the transaction detail route", () => {
    expect(investigationHref(largeExpenseWarning)).toBe(
      "/transactions/3fa85f64-5717-4562-b3fc-2c963f66bd01"
    );
  });

  it("uses singular link text only for a large expense", () => {
    expect(investigationLinkLabel("unusually_large_expense")).toBe("Review transaction");
    expect(investigationLinkLabel("overall_spend_spike")).toBe("Review transactions");
  });
});
