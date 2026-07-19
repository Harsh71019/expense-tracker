import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Account, ImportBatch } from "@vyaya/shared";
import { describe, expect, it, vi } from "vitest";

import { ImportList } from "./import-list";

const account: Account = {
  id: "3fa85f64-5717-4562-b3fc-2c963f66beef",
  userId: "u1",
  name: "HDFC Savings",
  type: "bank",
  currency: "INR",
  balanceMinor: 0,
  openingBalanceMinor: 0,
  isArchived: false,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-01T00:00:00.000Z")
};

function batch(overrides: Partial<ImportBatch> = {}): ImportBatch {
  return {
    id: "3fa85f64-5717-4562-b3fc-2c963f66be21",
    userId: "u1",
    accountId: account.id,
    filename: "HDFC-Statement-Jun.csv",
    fileHash: "hash",
    mapping: {
      date: "Date",
      description: "Narration",
      dateFormat: "DD/MM/YYYY",
      amountConvention: "debit_credit_cols",
      debit: "Withdrawal Amt.",
      credit: "Deposit Amt."
    },
    status: "staged",
    stats: { total: 31, staged: 30, duplicates: 1, committed: 0 },
    createdAt: new Date("2026-07-16T20:05:00.000Z"),
    updatedAt: new Date("2026-07-16T20:05:00.000Z"),
    ...overrides
  };
}

describe("ImportList", () => {
  it("shows an empty state with no batches", () => {
    render(<ImportList batches={[]} accounts={[]} onResume={vi.fn()} onRevert={vi.fn()} />);
    expect(screen.getByText("No statements imported")).toBeVisible();
  });

  it("shows Resume review for a staged batch and calls the callback", async () => {
    const user = userEvent.setup();
    const onResume = vi.fn();
    const staged = batch();
    render(
      <ImportList batches={[staged]} accounts={[account]} onResume={onResume} onRevert={vi.fn()} />
    );

    expect(screen.getByText("HDFC-Statement-Jun.csv")).toBeVisible();
    expect(screen.getByText(/HDFC Savings/)).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Resume review" }));
    expect(onResume).toHaveBeenCalledWith(staged);
  });

  it("shows Revert for a committed batch and calls the callback", async () => {
    const user = userEvent.setup();
    const onRevert = vi.fn();
    const committed = batch({
      status: "committed",
      stats: { total: 31, staged: 30, duplicates: 1, committed: 30 },
      committedAt: new Date("2026-07-18T09:00:00.000Z")
    });
    render(
      <ImportList
        batches={[committed]}
        accounts={[account]}
        onResume={vi.fn()}
        onRevert={onRevert}
      />
    );

    expect(screen.queryByRole("button", { name: "Resume review" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Revert" }));
    expect(onRevert).toHaveBeenCalledWith(committed);
  });
});
