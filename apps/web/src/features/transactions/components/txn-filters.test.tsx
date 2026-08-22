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

  it("filters by exact single date on change", () => {
    render(<TxnFilters filters={{ limit: 50 }} />);

    fireEvent.change(screen.getByLabelText("Filter by date"), { target: { value: "2026-08-15" } });
    expect(mocks.push).toHaveBeenCalledWith(
      "/transactions?from=2026-08-14T18%3A30%3A00.000Z&to=2026-08-15T18%3A29%3A59.999Z"
    );
  });

  it("switches to range mode and applies from and to date filters", () => {
    render(<TxnFilters filters={{ limit: 50 }} />);

    fireEvent.click(screen.getByRole("button", { name: "Date range mode" }));

    fireEvent.change(screen.getByLabelText("From date"), { target: { value: "2026-08-01" } });
    expect(mocks.push).toHaveBeenCalledWith("/transactions?from=2026-07-31T18%3A30%3A00.000Z");

    fireEvent.change(screen.getByLabelText("To date"), { target: { value: "2026-08-15" } });
    expect(mocks.push).toHaveBeenCalledWith("/transactions?to=2026-08-15T18%3A29%3A59.999Z");
  });

  it("applies today quick date preset", () => {
    vi.setSystemTime(new Date("2026-08-23T12:00:00.000+05:30"));
    render(<TxnFilters filters={{ limit: 50 }} />);

    fireEvent.click(screen.getByRole("button", { name: "Today" }));
    expect(mocks.push).toHaveBeenCalledWith(
      "/transactions?from=2026-08-22T18%3A30%3A00.000Z&to=2026-08-23T18%3A29%3A59.999Z"
    );
  });

  it("applies yesterday quick date preset", () => {
    vi.setSystemTime(new Date("2026-08-23T12:00:00.000+05:30"));
    render(<TxnFilters filters={{ limit: 50 }} />);

    fireEvent.click(screen.getByRole("button", { name: "Yesterday" }));
    expect(mocks.push).toHaveBeenCalledWith(
      "/transactions?from=2026-08-21T18%3A30%3A00.000Z&to=2026-08-22T18%3A29%3A59.999Z"
    );
  });

  it("displays single date active badge and removes filter on badge click", () => {
    render(
      <TxnFilters
        filters={{
          from: new Date("2026-08-14T18:30:00.000Z"),
          to: new Date("2026-08-15T18:29:59.999Z"),
          limit: 50
        }}
      />
    );

    expect(screen.getByText("Date: 2026-08-15")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Remove date filter" }));
    expect(mocks.push).toHaveBeenCalledWith("/transactions");
  });

  it("displays date range active badge and removes filter on badge click", () => {
    render(
      <TxnFilters
        filters={{
          from: new Date("2026-07-31T18:30:00.000Z"),
          to: new Date("2026-08-15T18:29:59.999Z"),
          limit: 50
        }}
      />
    );

    expect(screen.getByText("Date: 2026-08-01 → 2026-08-15")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Remove date filter" }));
    expect(mocks.push).toHaveBeenCalledWith("/transactions");
  });

  it("filters to uncategorized transactions", () => {
    render(<TxnFilters filters={{ limit: 50 }} />);

    fireEvent.click(screen.getByRole("combobox", { name: "Filter by category" }));
    fireEvent.click(screen.getByRole("option", { name: "Uncategorized" }));

    expect(mocks.push).toHaveBeenCalledWith("/transactions?uncategorized=true");
  });

  it("keeps secondary filters collapsed on mobile until requested", () => {
    render(<TxnFilters filters={{ limit: 50 }} />);

    const toggle = screen.getByRole("button", { name: "Filters" });
    const controls = document.querySelector("#transaction-filter-controls");

    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(controls).toHaveClass("hidden", "sm:contents");

    fireEvent.click(toggle);

    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(controls).toHaveClass("grid");
    expect(controls).not.toHaveClass("hidden");
  });

  it("clears active filters back to the canonical ledger URL", () => {
    render(<TxnFilters filters={{ q: "chai", limit: 50 }} />);

    fireEvent.click(screen.getByRole("button", { name: "Clear" }));
    expect(mocks.push).toHaveBeenCalledWith("/transactions");
  });
});
