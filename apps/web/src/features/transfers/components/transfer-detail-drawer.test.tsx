import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { TransferDetailDrawer } from "./transfer-detail-drawer";

const mocks = vi.hoisted(() => ({
  reverseMutate: vi.fn(),
  reversePending: false
}));

vi.mock("../hooks/use-transfers", () => ({
  useReverseTransfer: () => ({ mutate: mocks.reverseMutate, isPending: mocks.reversePending })
}));

const accounts = [
  {
    id: "3fa85f64-5717-4562-b3fc-2c963f66be01",
    userId: "user-1",
    name: "HDFC Savings",
    type: "bank" as const,
    currency: "INR" as const,
    openingBalanceMinor: 0,
    balanceMinor: 0,
    isArchived: false,
    createdAt: new Date(),
    updatedAt: new Date()
  },
  {
    id: "3fa85f64-5717-4562-b3fc-2c963f66be02",
    userId: "user-1",
    name: "Zerodha Stocks",
    type: "investment" as const,
    currency: "INR" as const,
    openingBalanceMinor: 0,
    balanceMinor: 0,
    isArchived: false,
    createdAt: new Date(),
    updatedAt: new Date()
  }
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

describe("TransferDetailDrawer", () => {
  beforeEach(() => {
    mocks.reverseMutate.mockReset();
    mocks.reversePending = false;
  });

  it("renders both legs, the meta grid, and tags", () => {
    render(<TransferDetailDrawer legs={[from, to]} accounts={accounts} onClose={vi.fn()} />);

    expect(screen.getByText("HDFC Savings")).toBeVisible();
    expect(screen.getByText("Zerodha Stocks")).toBeVisible();
    expect(screen.getByText("−₹5,000.00")).toBeVisible();
    expect(screen.getByText("+₹5,000.00")).toBeVisible();
    expect(screen.getByText("Posted")).toBeVisible();
    expect(screen.getByText("investing")).toBeVisible();
  });

  it("confirms and reverses the whole group, then closes", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<TransferDetailDrawer legs={[from, to]} accounts={accounts} onClose={onClose} />);

    await user.click(screen.getByRole("button", { name: "Reverse transfer" }));
    expect(screen.getByText("Reverse this transfer?")).toBeVisible();
    await user.click(screen.getByRole("button", { name: /Post reversal/ }));

    expect(mocks.reverseMutate).toHaveBeenCalledWith("grp-1");
    expect(onClose).toHaveBeenCalled();
  });

  it("shows a disabled note instead of the reverse button once already reversed", () => {
    render(
      <TransferDetailDrawer
        legs={[
          { ...from, status: "reversed" },
          { ...to, status: "reversed" }
        ]}
        accounts={accounts}
        onClose={vi.fn()}
      />
    );

    expect(screen.getByText("This transfer has already been reversed.")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Reverse transfer" })).not.toBeInTheDocument();
  });

  it("shows the reversal-specific note for a reversal group", () => {
    render(
      <TransferDetailDrawer
        legs={[
          { ...from, status: "reversal" },
          { ...to, status: "reversal" }
        ]}
        accounts={accounts}
        onClose={vi.fn()}
      />
    );

    expect(
      screen.getByText("This is a reversal transfer and cannot be reversed again.")
    ).toBeVisible();
  });
});
