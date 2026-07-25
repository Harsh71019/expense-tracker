import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Account } from "@treasury-ops/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AccountManager } from "./account-manager";

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
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

  it("keeps the operation error visible and also raises a toast", async () => {
    const user = userEvent.setup();
    mocks.create.mockRejectedValue(new Error("Account already exists"));
    render(<AccountManager initialAccounts={[]} />);

    await user.click(screen.getByRole("button", { name: /Create account/ }));
    await user.type(screen.getByLabelText("Account name"), "HDFC");
    await user.click(screen.getByRole("button", { name: "Create account" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Account already exists");
    expect(mocks.toastError).toHaveBeenCalledWith("Account already exists");
  });
});
