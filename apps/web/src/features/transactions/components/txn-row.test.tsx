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

describe("TxnRow", () => {
  it("renders a posted amount and undo action", async () => {
    const user = userEvent.setup();
    const onReverse = vi.fn();
    render(
      <TxnRow
        transaction={{ ...base, status: "posted" }}
        originalDescription={undefined}
        onReverse={onReverse}
        isReversing={false}
      />
    );
    expect(screen.getByText("−₹20.00")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Undo" }));
    expect(onReverse).toHaveBeenCalledWith(base.id);
  });

  it("makes reversed and reversal linkage explicit", () => {
    const { rerender } = render(
      <TxnRow
        transaction={{ ...base, status: "reversed" }}
        originalDescription={undefined}
        onReverse={vi.fn()}
        isReversing={false}
      />
    );
    expect(screen.getByText("Reversed")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Undo" })).toBeNull();
    rerender(
      <TxnRow
        transaction={{
          ...base,
          id: "507f1f77bcf86cd799439013",
          status: "reversal",
          reversalOf: base.id
        }}
        originalDescription="Chai"
        onReverse={vi.fn()}
        isReversing={false}
      />
    );
    expect(screen.getByText(/Reversal of: Chai/)).toBeVisible();
  });
});
