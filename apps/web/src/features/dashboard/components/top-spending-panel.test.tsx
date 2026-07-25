import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { TopSpendingItem } from "@treasury-ops/shared";
import { describe, expect, it, vi } from "vitest";

import { TopSpendingPanel } from "./top-spending-panel";

const mocks = vi.hoisted(() => ({ useTopSpending: vi.fn() }));
vi.mock("../hooks/use-top-spending", () => ({ useTopSpending: mocks.useTopSpending }));

const items: TopSpendingItem[] = [
  { name: "Rent", icon: "home", color: "#8b5cf6", amountMinor: 350_000_00, txnCount: 1 },
  { name: "Groceries", amountMinor: 150_000_00, txnCount: 14 }
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
