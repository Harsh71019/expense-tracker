import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { QuickAddForm } from "./quick-add-form";
import { ValidationError } from "@/lib/errors";

const mocks = vi.hoisted(() => ({
  mutateAsync: vi.fn(),
  accounts: [{ id: "3fa85f64-5717-4562-b3fc-2c963f66beef", name: "Cash", isArchived: false }],
  categories: [
    { id: "3fa85f64-5717-4562-b3fc-2c963f66beff", name: "Tea", kind: "expense", isArchived: false }
  ],
  accountsLoading: false,
  pending: false,
  error: new Error("No mutation error"),
  hasError: false,
  success: false
}));

vi.mock("../hooks/use-accounts", () => ({
  useAccounts: () => ({ data: mocks.accounts, isLoading: mocks.accountsLoading })
}));
vi.mock("../hooks/use-categories", () => ({ useCategories: () => ({ data: mocks.categories }) }));
vi.mock("../hooks/use-create-txn", () => ({
  useCreateTxn: () => ({
    mutateAsync: mocks.mutateAsync,
    isPending: mocks.pending,
    isError: mocks.hasError,
    error: mocks.error,
    isSuccess: mocks.success
  })
}));
vi.mock("./account-setup", () => ({ AccountSetup: () => <h1>No accounts yet</h1> }));

describe("QuickAddForm", () => {
  beforeEach(() => {
    mocks.accounts = [
      { id: "3fa85f64-5717-4562-b3fc-2c963f66beef", name: "Cash", isArchived: false }
    ];
    mocks.categories = [
      {
        id: "3fa85f64-5717-4562-b3fc-2c963f66beff",
        name: "Tea",
        kind: "expense",
        isArchived: false
      }
    ];
    mocks.accountsLoading = false;
    mocks.pending = false;
    mocks.error = new Error("No mutation error");
    mocks.hasError = false;
    mocks.success = false;
    mocks.mutateAsync.mockReset();
  });
  it("posts integer paise with an idempotency key created for the form", async () => {
    const user = userEvent.setup();
    mocks.mutateAsync.mockResolvedValue({});
    render(<QuickAddForm />);

    await user.selectOptions(
      screen.getByRole("combobox", { name: /Account/ }),
      mocks.accounts[0]?.id ?? ""
    );
    await user.selectOptions(screen.getByLabelText("Category"), mocks.categories[0]?.id ?? "");
    await user.clear(screen.getByLabelText("Amount"));
    await user.type(screen.getByLabelText("Amount"), "20");
    await user.tab();
    await user.type(screen.getByLabelText("What was it?"), "Chai");
    await user.click(screen.getByRole("button", { name: "Add to ledger" }));

    expect(mocks.mutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        accountId: mocks.accounts[0]?.id,
        amountMinor: 2_000,
        description: "Chai",
        idempotencyKey: expect.any(String)
      })
    );
  });

  it("explains the setup path when there are no accounts", () => {
    mocks.accounts = [];
    render(<QuickAddForm />);
    expect(screen.getByRole("heading", { name: "No accounts yet" })).toBeVisible();
  });

  it("shows an account loading state before rendering the form", () => {
    mocks.accountsLoading = true;
    render(<QuickAddForm />);

    expect(screen.getByText("Loading your accounts…")).toBeVisible();
  });

  it("adapts category choices and submit feedback to the transaction state", async () => {
    const user = userEvent.setup();
    mocks.categories = [
      ...mocks.categories,
      {
        id: "3fa85f64-5717-4562-b3fc-2c963f66be14",
        name: "Salary",
        kind: "income",
        isArchived: false
      },
      { id: "3fa85f64-5717-4562-b3fc-2c963f66be15", name: "Old", kind: "expense", isArchived: true }
    ];
    mocks.pending = true;
    mocks.error = new Error("offline");
    mocks.hasError = true;
    render(<QuickAddForm />);

    expect(screen.getByRole("button", { name: "Posting safely…" })).toBeDisabled();
    expect(screen.getByText("Could not save. Your entry is still ready to retry.")).toBeVisible();
    expect(screen.getByRole("option", { name: "Tea" })).toBeVisible();
    expect(screen.queryByRole("option", { name: "Salary" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Income" }));
    expect(screen.getByRole("option", { name: "Salary" })).toBeVisible();
  });

  it("confirms a successful save", () => {
    mocks.success = true;
    render(<QuickAddForm />);

    expect(screen.getByText("Saved to your ledger.")).toBeVisible();
  });

  it("validates before posting", async () => {
    const user = userEvent.setup();
    render(<QuickAddForm />);

    await user.click(screen.getByRole("button", { name: "Add to ledger" }));
    expect(mocks.mutateAsync).not.toHaveBeenCalled();
    expect(screen.getByText(/expected string to have >=1 characters/)).toBeVisible();
  });

  it("maps server field errors onto the form", async () => {
    const user = userEvent.setup();
    mocks.mutateAsync.mockRejectedValue(
      new ValidationError("Invalid", {}, [
        { path: "description", code: "invalid", message: "Use a clearer description" }
      ])
    );
    render(<QuickAddForm />);

    await user.selectOptions(screen.getByLabelText("Account"), mocks.accounts[0]?.id ?? "");
    await user.selectOptions(screen.getByLabelText("Category"), mocks.categories[0]?.id ?? "");
    await user.clear(screen.getByLabelText("Amount"));
    await user.type(screen.getByLabelText("Amount"), "20");
    await user.tab();
    await user.type(screen.getByLabelText("What was it?"), "Chai");
    await user.click(screen.getByRole("button", { name: "Add to ledger" }));

    expect(await screen.findByText("Use a clearer description")).toBeVisible();
  });
});
