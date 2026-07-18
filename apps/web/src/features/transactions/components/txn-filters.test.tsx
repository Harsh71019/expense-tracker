import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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
  beforeEach(() => {
    mocks.push.mockReset();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("debounces search input before updating the URL", () => {
    render(<TxnFilters filters={{ limit: 50 }} />);

    fireEvent.change(screen.getByLabelText("Search description"), { target: { value: "chai" } });
    expect(mocks.push).not.toHaveBeenCalled();

    vi.advanceTimersByTime(400);
    expect(mocks.push).toHaveBeenCalledWith("/transactions?q=chai");
  });

  it("applies date filters immediately on change", () => {
    render(<TxnFilters filters={{ limit: 50 }} />);

    fireEvent.change(screen.getByLabelText("From date"), { target: { value: "2026-07-01" } });
    expect(mocks.push).toHaveBeenCalledWith("/transactions?from=2026-07-01T00%3A00%3A00.000Z");
  });

  it("clears active filters back to the canonical ledger URL", () => {
    render(<TxnFilters filters={{ q: "chai", limit: 50 }} />);

    fireEvent.click(screen.getByRole("button", { name: "Clear" }));
    expect(mocks.push).toHaveBeenCalledWith("/transactions");
  });
});
