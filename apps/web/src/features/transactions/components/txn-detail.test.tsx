import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Transaction } from "@treasury-ops/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { TxnDetail } from "./txn-detail";

const mocks = vi.hoisted(() => ({
  update: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn()
}));

vi.mock("@/features/accounts", () => ({
  useAccounts: () => ({ data: [{ id: "3fa85f64-5717-4562-b3fc-2c963f66beef", name: "HDFC" }] })
}));
vi.mock("@/features/categories", () => ({ useCategories: () => ({ data: [] }) }));
vi.mock("@/features/transfers/hooks/use-transfers", () => ({
  useReverseTransfer: () => ({ mutate: vi.fn(), isPending: false })
}));
vi.mock("../hooks/use-reverse-txn", () => ({
  useReverseTxn: () => ({ mutate: vi.fn(), isPending: false })
}));
vi.mock("../hooks/use-txn", () => ({
  useTxn: (_id: string, initialData: Transaction) => ({ data: initialData }),
  useUpdateTxn: () => ({ mutateAsync: mocks.update, isPending: false })
}));
vi.mock("@/lib/toast", () => ({
  toast: { success: mocks.toastSuccess, error: mocks.toastError }
}));

const transaction: Transaction = {
  id: "3fa85f64-5717-4562-b3fc-2c963f66bef0",
  userId: "user-1",
  accountId: "3fa85f64-5717-4562-b3fc-2c963f66beef",
  type: "expense",
  amountMinor: 2_000,
  occurredAt: new Date("2026-07-16T00:00:00.000Z"),
  description: "Chai",
  tags: [],
  currency: "INR",
  source: "manual",
  status: "posted",
  createdAt: new Date("2026-07-16T00:00:00.000Z"),
  updatedAt: new Date("2026-07-16T00:00:00.000Z")
};

describe("TxnDetail", () => {
  beforeEach(() => {
    mocks.update.mockReset();
    mocks.toastSuccess.mockReset();
    mocks.toastError.mockReset();
  });

  it("toasts a successful metadata update", async () => {
    const user = userEvent.setup();
    mocks.update.mockResolvedValue({ ...transaction, description: "Masala chai" });
    render(<TxnDetail initialTransaction={transaction} />);

    await user.click(screen.getByRole("button", { name: "Edit metadata" }));
    await user.clear(screen.getByLabelText("Description"));
    await user.type(screen.getByLabelText("Description"), "Masala chai");
    await user.click(screen.getByRole("button", { name: "Save metadata" }));

    expect(mocks.toastSuccess).toHaveBeenCalledWith("Transaction details updated");
  });

  it("reports a failed metadata update inline and as a toast", async () => {
    const user = userEvent.setup();
    mocks.update.mockRejectedValue(new Error("Update rejected"));
    render(<TxnDetail initialTransaction={transaction} />);

    await user.click(screen.getByRole("button", { name: "Edit metadata" }));
    await user.clear(screen.getByLabelText("Description"));
    await user.type(screen.getByLabelText("Description"), "Masala chai");
    await user.click(screen.getByRole("button", { name: "Save metadata" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Update rejected");
    expect(mocks.toastError).toHaveBeenCalledWith("Update rejected");
  });
});
