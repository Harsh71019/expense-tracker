import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { TransferRow } from "./transfer-row";

function makeAccount(
  id: string,
  name: string
): {
  id: string;
  userId: string;
  name: string;
  type: "bank" | "cash";
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
  makeAccount("507f1f77bcf86cd799439001", "HDFC Bank"),
  makeAccount("507f1f77bcf86cd799439002", "Cash Wallet")
];

const from = {
  id: "507f1f77bcf86cd799439011",
  userId: "user-1",
  transferGroupId: "grp-1",
  accountId: accounts[0]?.id ?? "",
  type: "expense" as const,
  amountMinor: 5_000_00,
  currency: "INR" as const,
  occurredAt: new Date("2026-07-10T08:00:00.000Z"),
  description: "ATM cash withdrawal transfer",
  tags: [],
  source: "manual" as const,
  status: "posted" as const,
  createdAt: new Date(),
  updatedAt: new Date()
};

const to = {
  ...from,
  id: "507f1f77bcf86cd799439012",
  accountId: accounts[1]?.id ?? "",
  type: "income" as const
};

describe("TransferRow", () => {
  it("shows both leg accounts and opens the detail drawer on click", async () => {
    const user = userEvent.setup();
    const onOpen = vi.fn();
    render(
      <TransferRow
        legs={[from, to]}
        accounts={accounts}
        onOpen={onOpen}
        onReverse={vi.fn()}
        isReversing={false}
      />
    );

    expect(screen.getByText("HDFC Bank → Cash Wallet")).toBeVisible();
    await user.click(screen.getByText("ATM cash withdrawal transfer"));
    expect(onOpen).toHaveBeenCalledWith(from);
  });

  it("reverses without also opening the drawer", async () => {
    const user = userEvent.setup();
    const onOpen = vi.fn();
    const onReverse = vi.fn();
    render(
      <TransferRow
        legs={[from, to]}
        accounts={accounts}
        onOpen={onOpen}
        onReverse={onReverse}
        isReversing={false}
      />
    );

    await user.click(screen.getByRole("button", { name: "Reverse" }));
    expect(onReverse).toHaveBeenCalledWith("grp-1");
    expect(onOpen).not.toHaveBeenCalled();
  });

  it("hides the reverse action once every leg is reversed", () => {
    render(
      <TransferRow
        legs={[
          { ...from, status: "reversed" },
          { ...to, status: "reversed" }
        ]}
        accounts={accounts}
        onOpen={vi.fn()}
        onReverse={vi.fn()}
        isReversing={false}
      />
    );
    expect(screen.queryByRole("button", { name: "Reverse" })).not.toBeInTheDocument();
  });
});
