import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ImportBatch } from "@vyaya/shared";
import { describe, expect, it, vi } from "vitest";

import { RevertConfirmDialog } from "./revert-confirm-dialog";

const batch: ImportBatch = {
  id: "3fa85f64-5717-4562-b3fc-2c963f66be21",
  userId: "u1",
  accountId: "3fa85f64-5717-4562-b3fc-2c963f66beef",
  filename: "HDFC-Statement-May.csv",
  fileHash: "hash",
  mapping: {
    date: "Date",
    description: "Narration",
    dateFormat: "DD/MM/YYYY",
    amountConvention: "debit_credit_cols",
    debit: "Withdrawal Amt.",
    credit: "Deposit Amt."
  },
  status: "committed",
  stats: { total: 42, staged: 42, duplicates: 2, committed: 40 },
  createdAt: new Date("2026-06-01T00:00:00.000Z"),
  updatedAt: new Date("2026-06-02T14:10:00.000Z"),
  committedAt: new Date("2026-06-02T14:10:00.000Z")
};

describe("RevertConfirmDialog", () => {
  it("shows the committed count and filename, and confirms via the callback", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    render(
      <RevertConfirmDialog
        batch={batch}
        isPending={false}
        onCancel={vi.fn()}
        onConfirm={onConfirm}
      />
    );

    expect(screen.getByText(/reverse 40 posted transactions/i)).toBeVisible();
    expect(screen.getByText("HDFC-Statement-May.csv")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Reverse 40 transactions" }));
    expect(onConfirm).toHaveBeenCalled();
  });

  it("disables the confirm button while pending", () => {
    render(<RevertConfirmDialog batch={batch} isPending onCancel={vi.fn()} onConfirm={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Reversing…" })).toBeDisabled();
  });
});
