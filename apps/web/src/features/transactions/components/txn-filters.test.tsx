import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { TxnFilters } from "./txn-filters";

const mocks = vi.hoisted(() => ({ push: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.push })
}));
vi.mock("@/features/accounts", () => ({
  useAccounts: () => ({ data: [] })
}));
vi.mock("@/features/categories", () => ({
  useCategories: () => ({ data: [] })
}));

describe("TxnFilters", () => {
  it("keeps search and date filters in the transaction URL", async () => {
    const user = userEvent.setup();
    render(<TxnFilters filters={{ limit: 50 }} />);

    await user.type(screen.getByLabelText("Search description"), "chai");
    fireEvent.change(screen.getByLabelText("From"), { target: { value: "2026-07-01" } });
    fireEvent.change(screen.getByLabelText("To"), { target: { value: "2026-07-16" } });
    await user.click(screen.getByRole("button", { name: "Filter" }));

    expect(mocks.push).toHaveBeenCalledWith(
      "/transactions?from=2026-07-01T00%3A00%3A00.000Z&to=2026-07-16T00%3A00%3A00.000Z&q=chai"
    );
  });

  it("clears active filters back to the canonical ledger URL", async () => {
    const user = userEvent.setup();
    render(<TxnFilters filters={{ q: "chai", limit: 50 }} />);

    await user.click(screen.getByRole("button", { name: "Clear" }));

    expect(mocks.push).toHaveBeenCalledWith("/transactions");
  });
});
