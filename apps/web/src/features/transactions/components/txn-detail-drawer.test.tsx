import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { TxnDetailDrawer } from "./txn-detail-drawer";

const mocks = vi.hoisted(() => ({
  mutateAsync: vi.fn(),
  reverseMutate: vi.fn(),
  reversePending: false,
  accounts: [{ id: "507f1f77bcf86cd799439012", name: "HDFC Bank" }],
  categories: [
    { id: "507f1f77bcf86cd799439021", name: "Groceries", isArchived: false },
    { id: "507f1f77bcf86cd799439022", name: "Dining", isArchived: false }
  ]
}));

vi.mock("@/features/accounts", () => ({ useAccounts: () => ({ data: mocks.accounts }) }));
vi.mock("@/features/categories", () => ({ useCategories: () => ({ data: mocks.categories }) }));
vi.mock("../hooks/use-reverse-txn", () => ({
  useReverseTxn: () => ({ mutate: mocks.reverseMutate, isPending: mocks.reversePending })
}));
// useTxn mirrors the real hook's initialData fallback so each test can just vary the `transaction` prop.
vi.mock("../hooks/use-txn", () => ({
  useTxn: (_id: string, initialData: unknown) => ({ data: initialData }),
  useUpdateTxn: () => ({ mutateAsync: mocks.mutateAsync, isPending: false })
}));

const base = {
  id: "507f1f77bcf86cd799439011",
  userId: "user-1",
  accountId: "507f1f77bcf86cd799439012",
  categoryId: "507f1f77bcf86cd799439021",
  type: "expense" as const,
  amountMinor: 34_200,
  occurredAt: new Date("2026-07-13T08:00:00.000Z"),
  description: "BigBasket order",
  tags: ["groceries"],
  currency: "INR" as const,
  source: "manual" as const,
  createdAt: new Date(),
  updatedAt: new Date()
};

describe("TxnDetailDrawer", () => {
  beforeEach(() => {
    mocks.mutateAsync.mockReset();
    mocks.reverseMutate.mockReset();
    mocks.reversePending = false;
  });

  it("renders account/date/source/status and lets you edit description, category, and tags", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<TxnDetailDrawer transaction={{ ...base, status: "posted" }} onClose={onClose} />);

    expect(screen.getByText("HDFC Bank")).toBeVisible();
    expect(screen.getByText("−₹342.00")).toBeVisible();
    expect(screen.getByText("posted")).toBeVisible();
    expect(screen.getByDisplayValue("BigBasket order")).toBeVisible();
    expect(screen.getByText("#groceries")).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Dining" }));
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    expect(mocks.mutateAsync).toHaveBeenCalledWith({
      transactionId: base.id,
      patch: { categoryId: "507f1f77bcf86cd799439022" }
    });
    expect(onClose).toHaveBeenCalled();
  });

  it("hides editing and reverse for a reversed transaction, shows the status banner instead", () => {
    render(<TxnDetailDrawer transaction={{ ...base, status: "reversed" }} onClose={vi.fn()} />);

    expect(screen.getByText(/This transaction was reversed\. It stays on record/)).toBeVisible();
    expect(screen.queryByDisplayValue("BigBasket order")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Reverse & repost/ })).not.toBeInTheDocument();
  });

  it("hides editing and reverse for a transfer leg, and shows the transfer note", () => {
    const transferLeg = { ...base, status: "posted" as const, transferGroupId: "grp-1" };
    render(<TxnDetailDrawer transaction={transferLeg} onClose={vi.fn()} />);

    expect(screen.getByText(/This is a transfer leg\./)).toBeVisible();
    expect(screen.queryByDisplayValue("BigBasket order")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Reverse & repost/ })).not.toBeInTheDocument();
  });

  it("confirms and posts a reversal, then closes", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<TxnDetailDrawer transaction={{ ...base, status: "posted" }} onClose={onClose} />);

    await user.click(screen.getByRole("button", { name: /Reverse & repost/ }));
    expect(screen.getByText("Reverse this transaction?")).toBeVisible();
    await user.click(screen.getByRole("button", { name: /Post reversal/ }));

    expect(mocks.reverseMutate).toHaveBeenCalledWith(base.id);
    expect(onClose).toHaveBeenCalled();
  });

  it("adds and removes tags via the draft input and chip buttons", async () => {
    const user = userEvent.setup();
    render(<TxnDetailDrawer transaction={{ ...base, status: "posted" }} onClose={vi.fn()} />);

    await user.type(screen.getByPlaceholderText("Add tag…"), "urgent{Enter}");
    expect(screen.getByText("#urgent")).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Remove tag groceries" }));
    expect(screen.queryByText("#groceries")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Save changes" }));
    expect(mocks.mutateAsync).toHaveBeenCalledWith({
      transactionId: base.id,
      patch: { tags: ["urgent"] }
    });
  });
});
