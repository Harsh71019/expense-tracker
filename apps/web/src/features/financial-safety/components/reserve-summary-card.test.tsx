import { fireEvent, render, screen } from "@testing-library/react";
import type { ReserveSummary } from "@treasury-ops/shared";
import { describe, expect, it, vi } from "vitest";

import { ReserveSummaryCard } from "./reserve-summary-card";

const READY_FIXTURE: ReserveSummary = {
  computedAt: new Date("2026-08-18T00:00:00.000Z"),
  asOf: new Date("2026-08-18T00:00:00.000Z"),
  sourceThrough: new Date("2026-08-18T00:00:00.000Z"),
  formulaVersion: 1,
  policyVersion: 1,
  timezone: "Asia/Kolkata",
  configuredSourceCount: 2,
  currentlyEligibleSourceCount: 1,
  instantMinor: 200_000,
  tPlusOneMinor: 100_000,
  totalEligibleMinor: 300_000,
  lockedMinor: 500_000,
  staleExcludedMinor: 0,
  missingValueSourceCount: 0,
  staleSourceCount: 0,
  excludedSourceCount: 1,
  limitations: ["locked_sources_present"]
};

let mockHookReturn: {
  data: ReserveSummary | null;
  error: Error | null;
  isFetching: boolean;
  refetch: () => Promise<void>;
} = {
  data: READY_FIXTURE,
  error: null,
  isFetching: false,
  refetch: vi.fn().mockResolvedValue(undefined)
};

vi.mock("../hooks/use-reserve-summary", () => ({
  useReserveSummary: (initial: ReserveSummary | null) => ({
    ...mockHookReturn,
    data: mockHookReturn.data ?? initial
  })
}));

describe("ReserveSummaryCard", () => {
  it("shows the total eligible amount, never the locked amount, as the counted total", () => {
    mockHookReturn = { data: READY_FIXTURE, error: null, isFetching: false, refetch: vi.fn() };
    render(<ReserveSummaryCard initialData={READY_FIXTURE} />);

    expect(screen.getByText("₹3,000.00")).toBeInTheDocument(); // total eligible
    expect(screen.getByText("₹5,000.00")).toBeInTheDocument(); // locked, shown separately
    expect(screen.getByText("Ready")).toBeInTheDocument();
  });

  it("states clearly that classifying a source never moves money", () => {
    mockHookReturn = { data: READY_FIXTURE, error: null, isFetching: false, refetch: vi.fn() };
    render(<ReserveSummaryCard initialData={READY_FIXTURE} />);
    expect(screen.getByText(/does not move or lock your money/i)).toBeInTheDocument();
  });

  it("shows a Not ready badge when no source is currently eligible", () => {
    const notReady: ReserveSummary = { ...READY_FIXTURE, currentlyEligibleSourceCount: 0 };
    mockHookReturn = { data: notReady, error: null, isFetching: false, refetch: vi.fn() };
    render(<ReserveSummaryCard initialData={notReady} />);
    expect(screen.getByText("Not ready")).toBeInTheDocument();
  });

  it("renders a retry control on error with no data", () => {
    const refetch = vi.fn().mockResolvedValue(undefined);
    mockHookReturn = { data: null, error: new Error("network"), isFetching: false, refetch };
    render(<ReserveSummaryCard initialData={null} />);

    const retryButton = screen.getByRole("button", { name: /retry/i });
    fireEvent.click(retryButton);
    expect(refetch).toHaveBeenCalled();
  });

  it("renders nothing when there is no data and no error", () => {
    mockHookReturn = { data: null, error: null, isFetching: false, refetch: vi.fn() };
    const { container } = render(<ReserveSummaryCard initialData={null} />);
    expect(container).toBeEmptyDOMElement();
  });
});
