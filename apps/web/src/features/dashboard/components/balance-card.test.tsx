import { render, screen } from "@testing-library/react";
import type { Account } from "@treasury-ops/shared";
import { describe, expect, it } from "vitest";

import { BalanceCard } from "./balance-card";

const timestamp = new Date("2026-07-16T00:00:00.000Z");

function account(overrides: Partial<Account>): Account {
  return {
    id: "3fa85f64-5717-4562-b3fc-2c963f66beef",
    userId: "user-1",
    name: "Cash",
    type: "cash",
    openingBalanceMinor: 0,
    balanceMinor: 0,
    currency: "INR",
    isArchived: false,
    createdAt: timestamp,
    updatedAt: timestamp,
    ...overrides
  };
}

describe("BalanceCard", () => {
  it("splits active balances into assets and liabilities", () => {
    render(
      <BalanceCard
        accounts={[
          account({ id: "a1", balanceMinor: 10_000 }),
          account({ id: "a2", balanceMinor: -4_000 }),
          account({ id: "a3", balanceMinor: 500, isArchived: true })
        ]}
      />
    );

    expect(screen.getByText(/Total balance/)).toHaveTextContent(
      "Total balance · 2 active accounts"
    );
    expect(screen.getByText("+₹60.00")).toBeVisible();
    expect(screen.getByText("₹100.00")).toBeVisible();
    expect(screen.getByText("₹40.00")).toBeVisible();
  });

  it("singularizes the account label for exactly one active account", () => {
    render(<BalanceCard accounts={[account({ balanceMinor: 1_000 })]} />);
    expect(screen.getByText(/Total balance/)).toHaveTextContent("Total balance · 1 active account");
  });
});
