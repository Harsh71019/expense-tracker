import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { formatMinor, type Receivable } from "@treasury-ops/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { RecordRepaymentSheet } from "./record-repayment-sheet";

const mocks = vi.hoisted(() => ({
  mutateAsync: vi.fn(),
  accounts: [
    { id: "3fa85f64-5717-4562-b3fc-2c963f66be01", name: "HDFC Savings", isArchived: false }
  ],
  pending: false
}));

vi.mock("@/features/accounts", () => ({ useAccounts: () => ({ data: mocks.accounts }) }));
vi.mock("../hooks/use-receivable-mutations", () => ({
  useRecordReceivableRepayment: () => ({ mutateAsync: mocks.mutateAsync, isPending: mocks.pending })
}));
vi.mock("./link-existing-repayment", () => ({ LinkExistingRepayment: () => null }));
vi.mock("@/lib/toast", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const receivable: Receivable = {
  id: "3fa85f64-5717-4562-b3fc-2c963f66be99",
  counterpartyName: "Rohan",
  openedAt: new Date("2026-08-01T00:00:00Z"),
  outstandingMinor: 750_000,
  confirmedRepaidMinor: 250_000,
  repaymentCount: 1,
  status: "active",
  isMigrated: false,
  createdAt: new Date("2026-08-01T00:00:00Z"),
  updatedAt: new Date("2026-08-01T00:00:00Z")
};

describe("RecordRepaymentSheet", () => {
  beforeEach(() => {
    mocks.mutateAsync.mockReset();
    mocks.pending = false;
  });

  it("caps the amount field at the outstanding balance and shows the settle banner at an exact match", async () => {
    const user = userEvent.setup();
    render(<RecordRepaymentSheet receivable={receivable} onClose={vi.fn()} />);

    const amount = screen.getByLabelText("Amount received");
    await user.clear(amount);
    await user.type(amount, "999999999");
    await user.tab();

    expect(amount).toHaveValue(formatMinor(receivable.outstandingMinor));
    expect(screen.getByText("This will settle the debt.")).toBeVisible();
  });

  it("does not show the settle banner for a partial amount", async () => {
    const user = userEvent.setup();
    render(<RecordRepaymentSheet receivable={receivable} onClose={vi.fn()} />);

    const amount = screen.getByLabelText("Amount received");
    await user.clear(amount);
    await user.type(amount, "100");
    await user.tab();

    expect(screen.queryByText("This will settle the debt.")).not.toBeInTheDocument();
  });
});
