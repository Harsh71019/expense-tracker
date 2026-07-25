import type { BudgetProgress } from "@treasury-ops/shared";
import { describe, expect, it } from "vitest";

import {
  budgetAmountLabel,
  budgetMeterValueText,
  budgetStatusLabel,
  budgetTransactionsHref,
  clampedMeterPercent,
  monthLabel,
  utilizationPercent
} from "./presentation";

const progress: BudgetProgress = {
  budget: {
    id: "3fa85f64-5717-4562-b3fc-2c963f66be00",
    userId: "user-1",
    categoryId: "3fa85f64-5717-4562-b3fc-2c963f66be01",
    limitMinor: 500_000,
    isArchived: false,
    createdAt: new Date("2026-07-01T00:00:00.000Z"),
    updatedAt: new Date("2026-07-01T00:00:00.000Z")
  },
  category: {
    id: "3fa85f64-5717-4562-b3fc-2c963f66be01",
    name: "Groceries",
    icon: "shopping-cart",
    color: "#f97316",
    isArchived: false
  },
  spentMinor: 630_000,
  remainingMinor: -130_000,
  utilizationBps: 12_600,
  state: "reached",
  isEffective: true
};

describe("budget presentation", () => {
  it("keeps the full utilization in text while clamping the meter", () => {
    expect(utilizationPercent(progress.utilizationBps)).toBe(126);
    expect(clampedMeterPercent(progress.utilizationBps)).toBe(100);
    expect(budgetStatusLabel(progress.state)).toBe("Limit reached");
  });

  it("describes over-limit money without presenting a negative remaining amount", () => {
    expect(budgetAmountLabel(progress)).toBe("₹1,300.00 over");
    expect(budgetMeterValueText(progress)).toBe("₹6,300.00 spent of ₹5,000.00; ₹1,300.00 over.");
  });

  it("builds an exact IST month transaction link", () => {
    const href = budgetTransactionsHref(progress.category.id, "2026-07");
    const url = new URL(href, "https://treasury.example");

    expect(url.pathname).toBe("/transactions");
    expect(url.searchParams.get("categoryId")).toBe(progress.category.id);
    expect(url.searchParams.get("from")).toBe("2026-06-30T18:30:00.000Z");
    expect(url.searchParams.get("to")).toBe("2026-07-31T18:29:59.999Z");
    expect(monthLabel("2026-07")).toBe("July 2026");
  });
});
