import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { TopSpendingItem } from "@treasury-ops/shared";
import { describe, expect, it, vi } from "vitest";

import { TopSpendingPanel } from "./top-spending-panel";

const mocks = vi.hoisted(() => ({ useTopSpending: vi.fn() }));
vi.mock("../hooks/use-top-spending", () => ({ useTopSpending: mocks.useTopSpending }));

const items: TopSpendingItem[] = [
  {
    name: "Rent",
    icon: "home",
    color: "#8b5cf6",
    isArchived: false,
    amountMinor: 350_000_00,
    directAmountMinor: 350_000_00,
    txnCount: 1,
    children: []
  },
  {
    categoryId: "00000000-0000-4000-8000-000000000001",
    name: "Groceries",
    isArchived: false,
    amountMinor: 150_000_00,
    directAmountMinor: 50_000_00,
    txnCount: 14,
    children: [
      {
        categoryId: "00000000-0000-4000-8000-000000000002",
        parentCategoryId: "00000000-0000-4000-8000-000000000001",
        depth: 1,
        name: "Blinkit",
        isArchived: true,
        directSpentMinor: 100_000_00,
        directIncomeMinor: 0,
        directTxnCount: 9,
        totalSpentMinor: 100_000_00,
        totalIncomeMinor: 0,
        totalTxnCount: 9
      }
    ]
  }
];

describe("TopSpendingPanel", () => {
  it("ranks items descending with a share percentage each", () => {
    mocks.useTopSpending.mockReturnValue({ data: undefined });
    render(<TopSpendingPanel initialItems={items} initialRange="1M" />);

    expect(screen.getByText("Rent")).toBeVisible();
    expect(screen.getByText("Groceries")).toBeVisible();
    expect(screen.getByText("70%")).toBeVisible();
    expect(screen.getByText("30%")).toBeVisible();
  });

  it("shows children beneath their parent without adding them to the panel total", () => {
    mocks.useTopSpending.mockReturnValue({ data: undefined });
    render(<TopSpendingPanel initialItems={items} initialRange="1M" />);

    const breakdown = screen.getByRole("list", { name: "Groceries breakdown" });
    expect(within(breakdown).getByText("Blinkit")).toBeVisible();
    expect(within(breakdown).getByText("archived")).toBeVisible();
    expect(within(breakdown).getByText("₹1,00,000.00")).toBeVisible();
    expect(within(breakdown).getByText("Groceries (direct)")).toBeVisible();
    expect(within(breakdown).getByText("₹50,000.00")).toBeVisible();
    expect(screen.queryByRole("list", { name: "Rent breakdown" })).not.toBeInTheDocument();
    // 3.5L + 1.5L: Blinkit's 1L is already inside Groceries.
    expect(screen.getByText("₹5,00,000.00")).toBeVisible();
  });

  it("shows an empty state when nothing was spent", () => {
    mocks.useTopSpending.mockReturnValue({ data: undefined });
    render(<TopSpendingPanel initialItems={[]} initialRange="1M" />);

    expect(screen.getByText("No spending in this range.")).toBeVisible();
  });

  it("switches ranges on tab click", async () => {
    const user = userEvent.setup();
    mocks.useTopSpending.mockReturnValue({ data: undefined });
    render(<TopSpendingPanel initialItems={items} initialRange="1M" />);

    await user.click(screen.getByRole("button", { name: "12M" }));
    expect(mocks.useTopSpending).toHaveBeenLastCalledWith("12M", 6, undefined);
  });
});
