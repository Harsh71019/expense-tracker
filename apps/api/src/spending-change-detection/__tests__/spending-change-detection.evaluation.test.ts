import { describe, expect, it } from "vitest";

import {
  evaluateSpendingChangeDetectionChronologically,
  type LabeledSpendingChangePoint
} from "../spending-change-detection.evaluation.js";
import type { MatureStreamInput, TransactionInput } from "../detect-spending-changes.js";

describe("Spending Change Detection - Chronological Evaluation", () => {
  const userId = "eval-user-01";
  const startDate = new Date("2026-01-01T00:00:00.000Z");

  function makeTxn(id: string, dateStr: string, amountMinor: number): TransactionInput {
    return {
      id,
      userId,
      type: "expense",
      amountMinor,
      occurredAt: new Date(dateStr),
      createdAt: new Date(dateStr),
      updatedAt: new Date(dateStr),
      transferGroupId: null,
      accountType: "bank",
      billId: null,
      status: "posted"
    };
  }

  it("evaluates rolling origin decision windows chronologically without future-data leakage", () => {
    const points: LabeledSpendingChangePoint[] = [];

    // Create 30 labeled points spanning 30 weeks
    // Weeks 0..14: baseline 20,000 paise
    // Weeks 15..29: shift to 60,000 paise (true change point at index 15)
    for (let w = 0; w < 30; w++) {
      const d = new Date(startDate.getTime() + w * 7 * 86_400_000);
      const isShift = w >= 15;
      const amount = isShift ? 60_000 : 20_000;
      const isTrueChangePoint = w === 15;
      const trueNewMedianMinor = isShift ? 60_000 : null;

      points.push({
        transaction: makeTxn(`tx-${w}`, d.toISOString(), amount),
        isTrueChangePoint,
        trueNewMedianMinor
      });
    }

    const matureStreams: MatureStreamInput[] = [];
    const evalResult = evaluateSpendingChangeDetectionChronologically(
      points,
      matureStreams,
      userId,
      20
    );

    expect(evalResult.evaluatedOriginCount).toBeGreaterThanOrEqual(12);
    expect(evalResult.candidateMetrics).toBeDefined();
    expect(evalResult.baselineMetrics).toBeDefined();
    expect(evalResult.promotion).toBeDefined();
  });
});
