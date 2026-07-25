import { render, screen } from "@testing-library/react";
import type { BudgetProgress } from "@treasury-ops/shared";
import { describe, expect, it } from "vitest";

import { BudgetMeter } from "./budget-meter";

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
    icon: null,
    color: null,
    isArchived: false
  },
  spentMinor: 630_000,
  remainingMinor: -130_000,
  utilizationBps: 12_600,
  state: "reached",
  isEffective: true
};

describe("BudgetMeter", () => {
  it("uses a clamped meter value and exposes the complete money context", () => {
    render(<BudgetMeter progress={progress} />);

    const meter = screen.getByRole("meter", { name: "Groceries monthly budget" });
    expect(meter).toHaveAttribute("aria-valuenow", "100");
    expect(meter).toHaveAttribute(
      "aria-valuetext",
      "₹6,300.00 spent of ₹5,000.00; ₹1,300.00 over."
    );
    expect(screen.getByText("126% used")).toBeVisible();
  });
});
