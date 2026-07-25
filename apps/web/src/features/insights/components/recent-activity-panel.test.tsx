import { render, screen } from "@testing-library/react";
import type { RecentActivityItem } from "@treasury-ops/shared";
import { describe, expect, it } from "vitest";

import { RecentActivityPanel } from "./recent-activity-panel";

const timestamp = new Date("2026-07-16T00:00:00.000Z");

function item(overrides: Partial<RecentActivityItem>): RecentActivityItem {
  return {
    id: "3fa85f64-5717-4562-b3fc-2c963f66beef",
    accountId: "3fa85f64-5717-4562-b3fc-2c963f66bef0",
    accountName: "HDFC Savings",
    type: "expense",
    amountMinor: 4_500,
    description: "Swiggy order",
    occurredAt: timestamp,
    tags: [],
    ...overrides
  };
}

describe("RecentActivityPanel", () => {
  it("renders an empty state when there is no activity", () => {
    render(<RecentActivityPanel items={[]} />);
    expect(screen.getByText("No transactions yet")).toBeVisible();
  });

  it("renders each transaction with its account, date, and signed amount", () => {
    render(
      <RecentActivityPanel
        items={[
          item({ id: "t1", description: "Salary credit", type: "income", amountMinor: 8_500_000 }),
          item({ id: "t2", description: "Swiggy order" })
        ]}
      />
    );

    expect(screen.getByText("Salary credit")).toBeVisible();
    expect(screen.getByText("Swiggy order")).toBeVisible();
    expect(screen.getByText("+₹85,000.00")).toBeVisible();
    expect(screen.getByText("−₹45.00")).toBeVisible();
    expect(screen.getAllByText(/HDFC Savings/)).toHaveLength(2);
  });
});
