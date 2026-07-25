import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Account } from "@treasury-ops/shared";
import { describe, expect, it, vi } from "vitest";

import { AccountsPanel } from "./accounts-panel";

const timestamp = new Date("2026-07-16T00:00:00.000Z");

function account(overrides: Partial<Account>): Account {
  return {
    id: "3fa85f64-5717-4562-b3fc-2c963f66beef",
    userId: "user-1",
    name: "HDFC Savings",
    type: "bank",
    openingBalanceMinor: 0,
    balanceMinor: 62_842_50,
    currency: "INR",
    isArchived: false,
    createdAt: timestamp,
    updatedAt: timestamp,
    ...overrides
  };
}

describe("AccountsPanel", () => {
  it("lists only active accounts with their type label and balance", () => {
    render(
      <AccountsPanel
        accounts={[
          account({ id: "a1" }),
          account({ id: "a2", name: "Old wallet", isArchived: true })
        ]}
        onAddAccount={vi.fn()}
      />
    );

    expect(screen.getByText("HDFC Savings")).toBeVisible();
    expect(screen.getByText("Bank")).toBeVisible();
    expect(screen.queryByText("Old wallet")).not.toBeInTheDocument();
  });

  it("invokes onAddAccount when the add button is clicked", async () => {
    const user = userEvent.setup();
    const onAddAccount = vi.fn();
    render(<AccountsPanel accounts={[account({})]} onAddAccount={onAddAccount} />);

    await user.click(screen.getByRole("button", { name: "+ Add account" }));
    expect(onAddAccount).toHaveBeenCalledOnce();
  });
});
