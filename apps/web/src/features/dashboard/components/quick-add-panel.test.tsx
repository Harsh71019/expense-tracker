import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Account } from "@treasury-ops/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { QuickAddPanel } from "./quick-add-panel";

const mocks = vi.hoisted(() => ({ mutateAsync: vi.fn(), pending: false }));
vi.mock("@/features/quick-add", () => ({
  useCreateTxn: () => ({ mutateAsync: mocks.mutateAsync, isPending: mocks.pending })
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const timestamp = new Date("2026-07-16T00:00:00.000Z");

function account(overrides: Partial<Account>): Account {
  return {
    id: "3fa85f64-5717-4562-b3fc-2c963f66beef",
    userId: "user-1",
    name: "HDFC Savings",
    type: "bank",
    openingBalanceMinor: 0,
    balanceMinor: 0,
    currency: "INR",
    isArchived: false,
    createdAt: timestamp,
    updatedAt: timestamp,
    ...overrides
  };
}

describe("QuickAddPanel", () => {
  beforeEach(() => {
    mocks.mutateAsync.mockReset();
    mocks.pending = false;
  });

  it("keeps the submit button disabled until the form is valid", async () => {
    const user = userEvent.setup();
    render(<QuickAddPanel accounts={[account({})]} />);

    expect(screen.getByRole("button", { name: "Add transaction" })).toBeDisabled();
    await user.clear(screen.getByLabelText("Amount"));
    await user.type(screen.getByLabelText("Amount"), "45");
    await user.tab();
    await user.type(screen.getByLabelText("Description"), "Coffee");

    expect(screen.getByRole("button", { name: "Add transaction" })).toBeEnabled();
  });

  it("submits an expense with the current timestamp and resets the form", async () => {
    const user = userEvent.setup();
    mocks.mutateAsync.mockResolvedValue({});
    render(<QuickAddPanel accounts={[account({ id: "3fa85f64-5717-4562-b3fc-2c963f66bef0" })]} />);

    await user.clear(screen.getByLabelText("Amount"));
    await user.type(screen.getByLabelText("Amount"), "45");
    await user.tab();
    await user.type(screen.getByLabelText("Description"), "Coffee");
    await user.click(screen.getByRole("button", { name: "Add transaction" }));

    expect(mocks.mutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        accountId: "3fa85f64-5717-4562-b3fc-2c963f66bef0",
        type: "expense",
        amountMinor: 4_500,
        description: "Coffee",
        tags: [],
        idempotencyKey: expect.any(String)
      })
    );
    expect(await screen.findByRole("button", { name: "✓ Added" })).toBeVisible();
  });

  it("submits against the selected account when multiple are available", async () => {
    const user = userEvent.setup();
    mocks.mutateAsync.mockResolvedValue({});
    render(
      <QuickAddPanel
        accounts={[
          account({ id: "3fa85f64-5717-4562-b3fc-2c963f66bef0", name: "HDFC Savings" }),
          account({ id: "3fa85f64-5717-4562-b3fc-2c963f66bef1", name: "Cash Wallet" })
        ]}
      />
    );

    await user.selectOptions(screen.getByLabelText("Account"), "Cash Wallet");
    await user.clear(screen.getByLabelText("Amount"));
    await user.type(screen.getByLabelText("Amount"), "45");
    await user.tab();
    await user.type(screen.getByLabelText("Description"), "Coffee");
    await user.click(screen.getByRole("button", { name: "Add transaction" }));

    expect(mocks.mutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({ accountId: "3fa85f64-5717-4562-b3fc-2c963f66bef1" })
    );
  });

  it("switches to income and shows a useful error on failure", async () => {
    const user = userEvent.setup();
    mocks.mutateAsync.mockRejectedValue(new Error("Could not reach the ledger"));
    render(<QuickAddPanel accounts={[account({ id: "3fa85f64-5717-4562-b3fc-2c963f66bef0" })]} />);

    await user.click(screen.getByRole("button", { name: "Income" }));
    await user.clear(screen.getByLabelText("Amount"));
    await user.type(screen.getByLabelText("Amount"), "100");
    await user.tab();
    await user.type(screen.getByLabelText("Description"), "Refund");
    await user.click(screen.getByRole("button", { name: "Add transaction" }));

    expect(mocks.mutateAsync).toHaveBeenCalledWith(expect.objectContaining({ type: "income" }));
    expect(await screen.findByText("Could not reach the ledger")).toBeVisible();
  });
});
