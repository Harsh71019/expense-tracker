import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { CreateReceivableSheet } from "./create-receivable-sheet";

const mocks = vi.hoisted(() => ({
  mutateAsync: vi.fn(),
  accounts: [
    { id: "3fa85f64-5717-4562-b3fc-2c963f66be01", name: "HDFC Savings", isArchived: false }
  ],
  pending: false
}));

vi.mock("@/features/accounts", () => ({ useAccounts: () => ({ data: mocks.accounts }) }));
vi.mock("../hooks/use-receivable-mutations", () => ({
  useCreateReceivable: () => ({ mutateAsync: mocks.mutateAsync, isPending: mocks.pending })
}));
vi.mock("@/lib/toast", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

describe("CreateReceivableSheet", () => {
  beforeEach(() => {
    mocks.mutateAsync.mockReset();
    mocks.pending = false;
  });

  it("defaults to lend money now and explains it will not change net worth", async () => {
    render(<CreateReceivableSheet onClose={vi.fn()} />);

    expect(screen.getByRole("button", { name: "Lend money now" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
    expect(screen.getByText(/net worth is unchanged/i)).toBeVisible();
    expect(screen.getByLabelText("From account")).toBeVisible();
    expect(screen.getByLabelText("Transaction description")).toBeVisible();
  });

  it("switches to opening balance mode and explains net worth rises", async () => {
    const user = userEvent.setup();
    render(<CreateReceivableSheet onClose={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: "Add money already lent" }));

    expect(screen.getByText(/net worth rises by this amount/i)).toBeVisible();
    expect(screen.queryByLabelText("From account")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Transaction description")).not.toBeInTheDocument();
  });

  it("disables Save until a counterparty and a positive amount are entered", async () => {
    const user = userEvent.setup();
    render(<CreateReceivableSheet onClose={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: "Add money already lent" }));

    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();

    await user.type(screen.getByLabelText("Who owes this?"), "Rohan");
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();

    const amount = screen.getByLabelText("Amount currently owed");
    await user.clear(amount);
    await user.type(amount, "10000");
    await user.tab();

    expect(screen.getByRole("button", { name: "Save" })).toBeEnabled();
  });
});
