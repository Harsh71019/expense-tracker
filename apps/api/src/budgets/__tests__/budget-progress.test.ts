import type { Budget, BudgetCategory } from "@treasury-ops/shared";
import { describe, expect, it } from "vitest";

import {
  budgetProgressState,
  buildBudgetProgress,
  computeUtilizationBps
} from "../budget-progress.js";

const NOW = new Date("2026-07-19T00:00:00.000Z");

function budget(overrides: Partial<Budget> = {}): Budget {
  return {
    id: "3fa85f64-5717-4562-b3fc-2c963f66beef",
    userId: "user-1",
    categoryId: "5c2f1a1e-1111-4111-8111-111111111111",
    limitMinor: 500_000_00,
    isArchived: false,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides
  };
}

function category(overrides: Partial<BudgetCategory> = {}): BudgetCategory {
  return {
    id: "5c2f1a1e-1111-4111-8111-111111111111",
    name: "Groceries",
    icon: null,
    color: null,
    isArchived: false,
    ...overrides
  };
}

describe("computeUtilizationBps", () => {
  it.each([
    [0, 500_000_00, 0],
    [400_000_00, 500_000_00, 8_000],
    [500_000_00, 500_000_00, 10_000],
    [630_000_00, 500_000_00, 12_600]
  ])("spent %i of limit %i is %i bps", (spentMinor, limitMinor, expected) => {
    expect(computeUtilizationBps(spentMinor, limitMinor)).toBe(expected);
  });

  it.each([
    // 1e12 paise * 10_000 = 1e16 already exceeds Number.MAX_SAFE_INTEGER
    // (~9.007e15) done as plain float multiplication -- these pairs only stay
    // exact through the bigint intermediate, while the resulting bps itself
    // remains a small, safe number.
    [1_000_000_000_000, 2_000_000_000_000, 5_000],
    [Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER, 10_000]
  ])(
    "stays exact for spent=%i limit=%i (bigint intermediate, no float overflow)",
    (spentMinor, limitMinor, expected) => {
      const bps = computeUtilizationBps(spentMinor, limitMinor);
      expect(bps).toBe(expected);
      expect(Number.isSafeInteger(bps)).toBe(true);
    }
  );
});

describe("budgetProgressState", () => {
  it.each([
    [0, "under"],
    [7_999, "under"],
    [8_000, "approaching"],
    [9_999, "approaching"],
    [10_000, "reached"],
    [15_000, "reached"]
  ])("%i bps is %s", (utilizationBps, expected) => {
    expect(budgetProgressState(utilizationBps)).toBe(expected);
  });
});

describe("buildBudgetProgress", () => {
  it("computes remaining, utilization, and state for an effective budget", () => {
    const progress = buildBudgetProgress(budget(), category(), 450_000_00);
    expect(progress).toMatchObject({
      spentMinor: 450_000_00,
      remainingMinor: 50_000_00,
      utilizationBps: 9_000,
      state: "approaching",
      isEffective: true
    });
  });

  it("allows remainingMinor to go negative when over the limit", () => {
    const progress = buildBudgetProgress(
      budget({ limitMinor: 100_000_00 }),
      category(),
      130_000_00
    );
    expect(progress.remainingMinor).toBe(-30_000_00);
    expect(progress.state).toBe("reached");
  });

  it("zeroes progress and marks ineffective when the budget itself is archived", () => {
    const progress = buildBudgetProgress(budget({ isArchived: true }), category(), 450_000_00);
    expect(progress).toMatchObject({ spentMinor: 0, utilizationBps: 0, isEffective: false });
  });

  it("zeroes progress and marks ineffective when the category is archived", () => {
    const progress = buildBudgetProgress(budget(), category({ isArchived: true }), 450_000_00);
    expect(progress).toMatchObject({ spentMinor: 0, utilizationBps: 0, isEffective: false });
  });
});
