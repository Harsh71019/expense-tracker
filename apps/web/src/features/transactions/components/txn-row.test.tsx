import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { TxnRow } from "./txn-row";

const base = {
  id: "507f1f77bcf86cd799439011",
  userId: "user-1",
  accountId: "507f1f77bcf86cd799439012",
  type: "expense" as const,
  amountMinor: 2_000,
  occurredAt: new Date("2026-07-16T08:00:00.000Z"),
  description: "Chai",
  tags: [],
  currency: "INR" as const,
  source: "manual" as const,
  createdAt: new Date(),
  updatedAt: new Date()
};

const category = {
  id: "507f1f77bcf86cd799439099",
  userId: "user-1",
  name: "Food & Dining",
  kind: "expense" as const,
  isArchived: false,
  createdAt: new Date(),
  updatedAt: new Date()
};

describe("TxnRow", () => {
  it("renders the amount, category, and opens the detail drawer on click", async () => {
    const user = userEvent.setup();
    const onOpen = vi.fn();
    const transaction = { ...base, status: "posted" as const };
    render(<TxnRow transaction={transaction} category={category} onOpen={onOpen} />);

    expect(screen.getByText("−₹20.00")).toBeVisible();
    expect(screen.getByText("Food & Dining")).toBeVisible();
    await user.click(screen.getByRole("button", { name: /Chai/ }));
    expect(onOpen).toHaveBeenCalledWith(transaction);
  });

  it("shows a dash for an uncategorized transaction", () => {
    render(
      <TxnRow transaction={{ ...base, status: "posted" }} category={undefined} onOpen={vi.fn()} />
    );
    expect(screen.getByText("—")).toBeVisible();
  });

  it("makes reversed and reversal status explicit", () => {
    const { rerender } = render(
      <TxnRow transaction={{ ...base, status: "reversed" }} category={category} onOpen={vi.fn()} />
    );
    expect(screen.getByText("Reversed")).toBeVisible();

    rerender(
      <TxnRow
        transaction={{
          ...base,
          id: "507f1f77bcf86cd799439013",
          status: "reversal",
          reversalOf: base.id
        }}
        category={category}
        onOpen={vi.fn()}
      />
    );
    expect(screen.getByText("Reversal entry")).toBeVisible();
  });

  it("shows a source badge for non-manual entries only", () => {
    const { rerender } = render(
      <TxnRow
        transaction={{ ...base, status: "posted", source: "csv_import" }}
        category={category}
        onOpen={vi.fn()}
      />
    );
    expect(screen.getByText("CSV")).toBeVisible();

    rerender(
      <TxnRow transaction={{ ...base, status: "posted" }} category={category} onOpen={vi.fn()} />
    );
    expect(screen.queryByText("Manual")).toBeNull();
  });
});
