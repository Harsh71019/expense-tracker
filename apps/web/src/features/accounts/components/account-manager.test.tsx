import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AccountSchema, type Account } from "@treasury-ops/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AccountManager } from "./account-manager";

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  updateConfig: vi.fn(),
  archive: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn()
}));

vi.mock("../hooks/use-accounts", () => ({
  useAccounts: (initialAccounts: Account[]) => ({ data: initialAccounts })
}));
vi.mock("../hooks/use-create-account", () => ({
  useCreateAccount: () => ({ mutateAsync: mocks.create, isPending: false })
}));
vi.mock("../hooks/use-archive-account", () => ({
  useArchiveAccount: () => ({ mutateAsync: mocks.archive, isPending: false })
}));
vi.mock("../hooks/use-update-credit-card-config", () => ({
  useUpdateCreditCardConfig: () => ({ mutateAsync: mocks.updateConfig, isPending: false })
}));
vi.mock("@/lib/toast", () => ({
  toast: { success: mocks.toastSuccess, error: mocks.toastError }
}));

const account: Account = {
  id: "3fa85f64-5717-4562-b3fc-2c963f66beef",
  userId: "user-1",
  name: "HDFC",
  type: "bank",
  currency: "INR",
  balanceMinor: 0,
  openingBalanceMinor: 0,
  isArchived: false,
  createdAt: new Date("2026-07-01T00:00:00.000Z"),
  updatedAt: new Date("2026-07-01T00:00:00.000Z")
};

describe("AccountManager", () => {
  beforeEach(() => {
    mocks.create.mockReset();
    mocks.archive.mockReset();
    mocks.updateConfig.mockReset();
    mocks.toastSuccess.mockReset();
    mocks.toastError.mockReset();
  });

  it("toasts successful account creation and archival", async () => {
    const user = userEvent.setup();
    mocks.create.mockResolvedValue(account);
    mocks.archive.mockResolvedValue(undefined);
    render(<AccountManager initialAccounts={[account]} />);

    await user.click(screen.getByRole("button", { name: /New account/ }));
    await user.type(screen.getByLabelText("Account name"), "Wallet");
    await user.click(screen.getByRole("button", { name: "Create account" }));

    await waitFor(() => expect(mocks.toastSuccess).toHaveBeenCalledWith("Account created"));

    await user.click(screen.getByRole("button", { name: "Archive" }));
    await user.click(screen.getByRole("button", { name: "Archive account" }));

    await waitFor(() => expect(mocks.toastSuccess).toHaveBeenCalledWith("Account archived"));
  });

  it("opens the account detail dialog on click without triggering it from Archive", async () => {
    const user = userEvent.setup();
    render(<AccountManager initialAccounts={[account]} />);

    await user.click(screen.getByRole("button", { name: "Archive" }));
    expect(screen.getByRole("heading", { name: "Archive HDFC?" })).toBeVisible();
    expect(screen.queryByText(account.id)).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    await user.click(screen.getByRole("button", { name: "View details for HDFC" }));
    expect(screen.getByText(account.id)).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Close account details" }));
    expect(screen.queryByText(account.id)).not.toBeInTheDocument();
  });

  it("keeps the operation error visible and also raises a toast", async () => {
    const user = userEvent.setup();
    mocks.create.mockRejectedValue(new Error("Account already exists"));
    render(<AccountManager initialAccounts={[]} />);

    await user.click(screen.getByRole("button", { name: /Create account/ }));
    await user.type(screen.getByLabelText("Account name"), "HDFC");
    await user.click(screen.getByRole("button", { name: "Create account" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Could not create this account.");
    expect(mocks.toastError).toHaveBeenCalledWith("Could not create this account.");
  });

  it("submits billing-cycle configuration only for a credit card", async () => {
    const user = userEvent.setup();
    mocks.create.mockResolvedValue(account);
    render(<AccountManager initialAccounts={[]} />);

    await user.click(screen.getByRole("button", { name: /Create account/ }));
    const dialog = screen.getByRole("dialog", { name: "New account" });
    expect(dialog).toHaveClass("w-full");
    await user.type(within(dialog).getByLabelText("Account name"), "HDFC Card");
    await user.click(within(dialog).getByRole("button", { name: /Cards/ }));
    await user.type(within(dialog).getByLabelText("Statement day"), "25");
    await user.type(within(dialog).getByLabelText("Due day"), "15");
    await user.click(within(dialog).getByRole("button", { name: "Create account" }));

    await waitFor(() =>
      expect(mocks.create).toHaveBeenCalledWith({
        name: "HDFC Card",
        type: "credit_card",
        openingBalanceMinor: 0,
        creditCardConfig: { statementDay: 25, dueDay: 15 }
      })
    );
  });

  it("configures a legacy credit card without recalculating old bills", async () => {
    const user = userEvent.setup();
    const card = AccountSchema.parse({
      ...account,
      id: "3fa85f64-5717-4562-b3fc-2c963f66beff",
      name: "Legacy card",
      type: "credit_card"
    });
    mocks.updateConfig.mockResolvedValue(card);
    render(<AccountManager initialAccounts={[card]} />);

    await user.click(screen.getByRole("button", { name: "Set billing cycle" }));
    await user.type(screen.getByLabelText("Statement day"), "31");
    await user.type(screen.getByLabelText("Due day"), "10");
    await user.click(screen.getByRole("button", { name: "Save cycle" }));

    await waitFor(() =>
      expect(mocks.updateConfig).toHaveBeenCalledWith({
        accountId: card.id,
        config: { statementDay: 31, dueDay: 10 }
      })
    );
    expect(mocks.toastSuccess).toHaveBeenCalledWith("Billing cycle updated");
  });
});
