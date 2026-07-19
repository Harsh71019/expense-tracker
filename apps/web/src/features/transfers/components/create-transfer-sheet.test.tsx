import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { CreateTransferSheet } from "./create-transfer-sheet";

const mocks = vi.hoisted(() => ({
  mutateAsync: vi.fn(),
  accounts: [
    { id: "3fa85f64-5717-4562-b3fc-2c963f66be01", name: "HDFC Savings", isArchived: false },
    { id: "3fa85f64-5717-4562-b3fc-2c963f66be02", name: "Zerodha Stocks", isArchived: false },
    { id: "3fa85f64-5717-4562-b3fc-2c963f66be03", name: "Cash Wallet", isArchived: false }
  ],
  pending: false
}));

vi.mock("@/features/accounts", () => ({ useAccounts: () => ({ data: mocks.accounts }) }));
vi.mock("../hooks/use-transfers", () => ({
  useCreateTransfer: () => ({ mutateAsync: mocks.mutateAsync, isPending: mocks.pending })
}));

describe("CreateTransferSheet", () => {
  beforeEach(() => {
    mocks.pending = false;
    mocks.mutateAsync.mockReset();
  });

  it("disables Post transfer until both accounts, an amount, and a description are set", async () => {
    const user = userEvent.setup();
    render(<CreateTransferSheet onClose={vi.fn()} />);

    expect(screen.getByRole("button", { name: "Post transfer" })).toBeDisabled();

    await user.selectOptions(screen.getByLabelText("From account"), mocks.accounts[0]?.id ?? "");
    await user.selectOptions(screen.getByLabelText("To account"), mocks.accounts[1]?.id ?? "");
    await user.type(screen.getByLabelText("Amount"), "5000");
    await user.tab();
    expect(screen.getByRole("button", { name: "Post transfer" })).toBeDisabled();

    await user.type(screen.getByLabelText("Description"), "Move to investments");
    expect(screen.getByRole("button", { name: "Post transfer" })).toBeEnabled();
  });

  it("excludes the selected From account from the To options", async () => {
    const user = userEvent.setup();
    render(<CreateTransferSheet onClose={vi.fn()} />);

    await user.selectOptions(screen.getByLabelText("From account"), mocks.accounts[0]?.id ?? "");
    expect(
      within(screen.getByLabelText("To account")).queryByRole("option", { name: "HDFC Savings" })
    ).not.toBeInTheDocument();
  });

  it("swaps the from and to accounts", async () => {
    const user = userEvent.setup();
    render(<CreateTransferSheet onClose={vi.fn()} />);

    await user.selectOptions(screen.getByLabelText("From account"), mocks.accounts[0]?.id ?? "");
    await user.selectOptions(screen.getByLabelText("To account"), mocks.accounts[1]?.id ?? "");
    await user.click(screen.getByRole("button", { name: "Swap from and to accounts" }));

    expect(screen.getByLabelText("From account")).toHaveValue(mocks.accounts[1]?.id);
    expect(screen.getByLabelText("To account")).toHaveValue(mocks.accounts[0]?.id);
  });

  it("posts a transfer with the entered fields", async () => {
    const user = userEvent.setup();
    mocks.mutateAsync.mockResolvedValue({});
    const onClose = vi.fn();
    render(<CreateTransferSheet onClose={onClose} />);

    await user.selectOptions(screen.getByLabelText("From account"), mocks.accounts[0]?.id ?? "");
    await user.selectOptions(screen.getByLabelText("To account"), mocks.accounts[1]?.id ?? "");
    await user.type(screen.getByLabelText("Amount"), "5000");
    await user.tab();
    await user.type(screen.getByLabelText("Description"), "Move to investments");
    await user.click(screen.getByRole("button", { name: "Post transfer" }));

    expect(mocks.mutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        fromAccountId: mocks.accounts[0]?.id,
        toAccountId: mocks.accounts[1]?.id,
        amountMinor: 500_000,
        description: "Move to investments"
      })
    );
    expect(onClose).toHaveBeenCalled();
  });

  it("closes without posting on Cancel", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<CreateTransferSheet onClose={onClose} />);

    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onClose).toHaveBeenCalled();
    expect(mocks.mutateAsync).not.toHaveBeenCalled();
  });
});
