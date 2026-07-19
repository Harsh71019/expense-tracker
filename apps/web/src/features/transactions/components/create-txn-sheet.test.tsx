import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { CreateTxnSheet } from "./create-txn-sheet";

const mocks = vi.hoisted(() => ({
  mutateAsync: vi.fn(),
  accounts: [{ id: "3fa85f64-5717-4562-b3fc-2c963f66beef", name: "Cash", isArchived: false }],
  categories: [
    {
      id: "3fa85f64-5717-4562-b3fc-2c963f66beff",
      name: "Groceries",
      kind: "expense",
      isArchived: false
    },
    {
      id: "3fa85f64-5717-4562-b3fc-2c963f66bef0",
      name: "Salary",
      kind: "income",
      isArchived: false
    }
  ],
  pending: false
}));

vi.mock("@/features/accounts", () => ({ useAccounts: () => ({ data: mocks.accounts }) }));
vi.mock("@/features/categories", () => ({ useCategories: () => ({ data: mocks.categories }) }));
vi.mock("@/features/quick-add", () => ({
  useCreateTxn: () => ({ mutateAsync: mocks.mutateAsync, isPending: mocks.pending })
}));

describe("CreateTxnSheet", () => {
  beforeEach(() => {
    mocks.pending = false;
    mocks.mutateAsync.mockReset();
  });

  it("disables Post entry until amount and description are both present", async () => {
    const user = userEvent.setup();
    render(<CreateTxnSheet onClose={vi.fn()} />);

    expect(screen.getByRole("button", { name: "Post entry" })).toBeDisabled();

    await user.type(screen.getByLabelText("Amount"), "150");
    await user.tab();
    expect(screen.getByRole("button", { name: "Post entry" })).toBeDisabled();

    await user.type(screen.getByLabelText("Description"), "Vegetables");
    expect(screen.getByRole("button", { name: "Post entry" })).toBeEnabled();
  });

  it("posts an expense with the entered fields and an idempotency key", async () => {
    const user = userEvent.setup();
    mocks.mutateAsync.mockResolvedValue({});
    const onClose = vi.fn();
    render(<CreateTxnSheet onClose={onClose} />);

    await user.selectOptions(
      screen.getByRole("combobox", { name: /Account/ }),
      mocks.accounts[0]?.id ?? ""
    );
    await user.type(screen.getByLabelText("Amount"), "150");
    await user.tab();
    await user.selectOptions(
      screen.getByRole("combobox", { name: /Category/ }),
      mocks.categories[0]?.id ?? ""
    );
    await user.type(screen.getByLabelText("Description"), "Vegetables");
    await user.click(screen.getByRole("button", { name: "Post entry" }));

    expect(mocks.mutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        accountId: mocks.accounts[0]?.id,
        categoryId: mocks.categories[0]?.id,
        type: "expense",
        amountMinor: 15_000,
        description: "Vegetables",
        idempotencyKey: expect.any(String)
      })
    );
    expect(onClose).toHaveBeenCalled();
  });

  it("filters the category list by the selected type", async () => {
    const user = userEvent.setup();
    render(<CreateTxnSheet onClose={vi.fn()} />);

    expect(screen.getByRole("option", { name: "Groceries" })).toBeVisible();
    expect(screen.queryByRole("option", { name: "Salary" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Income" }));
    expect(screen.getByRole("option", { name: "Salary" })).toBeVisible();
    expect(screen.queryByRole("option", { name: "Groceries" })).not.toBeInTheDocument();
  });

  it("closes without posting on Cancel", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<CreateTxnSheet onClose={onClose} />);

    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onClose).toHaveBeenCalled();
    expect(mocks.mutateAsync).not.toHaveBeenCalled();
  });
});
