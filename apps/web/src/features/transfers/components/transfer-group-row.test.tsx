import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { TransferGroupRow } from "./transfer-group-row";

function makeAccount(
  id: string,
  name: string
): {
  id: string;
  userId: string;
  name: string;
  type: "bank";
  currency: "INR";
  openingBalanceMinor: number;
  balanceMinor: number;
  isArchived: boolean;
  createdAt: Date;
  updatedAt: Date;
} {
  return {
    id,
    userId: "user-1",
    name,
    type: "bank",
    currency: "INR",
    openingBalanceMinor: 0,
    balanceMinor: 0,
    isArchived: false,
    createdAt: new Date(),
    updatedAt: new Date()
  };
}

const accounts = [
  makeAccount("3fa85f64-5717-4562-b3fc-2c963f66be01", "HDFC Savings"),
  makeAccount("3fa85f64-5717-4562-b3fc-2c963f66be02", "Zerodha Stocks")
];

const from = {
  id: "3fa85f64-5717-4562-b3fc-2c963f66beef",
  userId: "user-1",
  transferGroupId: "grp-1",
  accountId: accounts[0]?.id ?? "",
  type: "expense" as const,
  amountMinor: 5_000_00,
  currency: "INR" as const,
  occurredAt: new Date("2026-07-10T08:00:00.000Z"),
  description: "Monthly SIP top-up",
  tags: ["investing"],
  source: "manual" as const,
  status: "posted" as const,
  createdAt: new Date(),
  updatedAt: new Date()
};

const to = {
  ...from,
  id: "3fa85f64-5717-4562-b3fc-2c963f66beff",
  accountId: accounts[1]?.id ?? "",
  type: "income" as const
};

describe("TransferGroupRow", () => {
  it("shows both account names, the description, and opens the drawer on click", async () => {
    const user = userEvent.setup();
    const onOpen = vi.fn();
    render(<TransferGroupRow legs={[from, to]} accounts={accounts} onOpen={onOpen} />);

    expect(screen.getByText("HDFC Savings")).toBeVisible();
    expect(screen.getByText("Zerodha Stocks")).toBeVisible();
    expect(screen.getByText("Monthly SIP top-up")).toBeVisible();

    await user.click(screen.getByRole("button"));
    expect(onOpen).toHaveBeenCalledWith([from, to]);
  });

  it("shows a Reversed badge for a reversed group", () => {
    render(
      <TransferGroupRow
        legs={[
          { ...from, status: "reversed" },
          { ...to, status: "reversed" }
        ]}
        accounts={accounts}
        onOpen={vi.fn()}
      />
    );
    expect(screen.getByText("Reversed")).toBeVisible();
  });

  it("shows a Reversal badge for a reversal group", () => {
    render(
      <TransferGroupRow
        legs={[
          { ...from, status: "reversal" },
          { ...to, status: "reversal" }
        ]}
        accounts={accounts}
        onOpen={vi.fn()}
      />
    );
    expect(screen.getByText("Reversal")).toBeVisible();
  });
});
