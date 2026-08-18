import { fireEvent, render, screen } from "@testing-library/react";
import type { EssentialBurnResponse } from "@treasury-ops/shared";
import { describe, expect, it, vi } from "vitest";

import { EssentialBurnCard } from "./essential-burn-card";

const COMPLETE_FIXTURE: EssentialBurnResponse = {
  computedAt: new Date("2026-08-18T10:00:00.000Z"),
  asOf: new Date("2026-08-18T10:00:00.000Z"),
  sourceThrough: new Date("2026-08-18T10:00:00.000Z"),
  formulaVersion: 1,
  timezone: "Asia/Kolkata",
  requiredCompleteMonths: 3,
  observedCompleteMonthCount: 3,
  averageMonthlyEssentialMinor: 5_000_000,
  quality: "complete",
  completeMonths: [
    {
      month: "2026-05",
      observation: "observed",
      essentialTotalMinor: 5_000_000,
      eligibleExpenseTransactionCount: 5,
      essentialTransactionCount: 3
    },
    {
      month: "2026-06",
      observation: "observed",
      essentialTotalMinor: 5_000_000,
      eligibleExpenseTransactionCount: 5,
      essentialTransactionCount: 3
    },
    {
      month: "2026-07",
      observation: "observed",
      essentialTotalMinor: 5_000_000,
      eligibleExpenseTransactionCount: 5,
      essentialTransactionCount: 3
    }
  ],
  currentPartialMonth: {
    month: "2026-08",
    essentialTotalMinor: 2_000_000,
    eligibleExpenseTransactionCount: 2,
    essentialTransactionCount: 1,
    excludedFromBaseline: true
  },
  classification: {
    eligibleExpenseTransactionCount: 15,
    essentialExpenseTransactionCount: 9,
    lifestyleExpenseTransactionCount: 6,
    uncategorizedExpenseCount: 0,
    uncategorizedExpenseMinor: 0,
    ungroupedExpenseCount: 0,
    ungroupedExpenseMinor: 0,
    categorizedExpenseMinor: 15_000_000,
    unclassifiedExpenseMinor: 0,
    coverageRatioBps: 10000,
    currentCategoryMetadataInUse: true
  },
  limitations: ["current_category_metadata_in_use"]
};

const LIMITED_FIXTURE: EssentialBurnResponse = {
  ...COMPLETE_FIXTURE,
  quality: "limited",
  observedCompleteMonthCount: 1,
  averageMonthlyEssentialMinor: 4_500_000,
  completeMonths: [
    {
      month: "2026-05",
      observation: "missing_history",
      essentialTotalMinor: 0,
      eligibleExpenseTransactionCount: 0,
      essentialTransactionCount: 0
    },
    {
      month: "2026-06",
      observation: "missing_history",
      essentialTotalMinor: 0,
      eligibleExpenseTransactionCount: 0,
      essentialTransactionCount: 0
    },
    {
      month: "2026-07",
      observation: "observed",
      essentialTotalMinor: 4_500_000,
      eligibleExpenseTransactionCount: 4,
      essentialTransactionCount: 2
    }
  ],
  limitations: ["current_category_metadata_in_use", "insufficient_history"]
};

const UNAVAILABLE_FIXTURE: EssentialBurnResponse = {
  ...COMPLETE_FIXTURE,
  quality: "unavailable",
  observedCompleteMonthCount: 0,
  averageMonthlyEssentialMinor: null,
  completeMonths: [
    {
      month: "2026-05",
      observation: "missing_history",
      essentialTotalMinor: 0,
      eligibleExpenseTransactionCount: 0,
      essentialTransactionCount: 0
    },
    {
      month: "2026-06",
      observation: "missing_history",
      essentialTotalMinor: 0,
      eligibleExpenseTransactionCount: 0,
      essentialTransactionCount: 0
    },
    {
      month: "2026-07",
      observation: "missing_history",
      essentialTotalMinor: 0,
      eligibleExpenseTransactionCount: 0,
      essentialTransactionCount: 0
    }
  ],
  limitations: ["current_category_metadata_in_use", "no_history"]
};

const CLASSIFICATION_LIMITED_FIXTURE: EssentialBurnResponse = {
  ...COMPLETE_FIXTURE,
  classification: {
    ...COMPLETE_FIXTURE.classification,
    uncategorizedExpenseCount: 3,
    uncategorizedExpenseMinor: 300_000
  },
  limitations: ["current_category_metadata_in_use", "uncategorized_expenses_present"]
};

let mockPrivacyMode = false;
vi.mock("@/lib/privacy/privacy-context", () => ({
  usePrivacy: () => ({
    privacyMode: mockPrivacyMode
  })
}));

let mockHookReturn: {
  data: EssentialBurnResponse | null;
  error: Error | null;
  isFetching: boolean;
  refetch: () => Promise<void>;
} = {
  data: COMPLETE_FIXTURE,
  error: null,
  isFetching: false,
  refetch: vi.fn().mockResolvedValue(undefined)
};

vi.mock("../hooks/use-essential-burn", () => ({
  useEssentialBurn: (initial: EssentialBurnResponse | null) => ({
    ...mockHookReturn,
    data: mockHookReturn.data ?? initial
  })
}));

describe("EssentialBurnCard", () => {
  it("renders complete baseline with formatted amount, badge, and breakdown trigger", () => {
    mockHookReturn = {
      data: COMPLETE_FIXTURE,
      error: null,
      isFetching: false,
      refetch: vi.fn()
    };
    mockPrivacyMode = false;

    render(<EssentialBurnCard initialData={COMPLETE_FIXTURE} />);

    expect(screen.getByText("Essential Monthly Burn")).toBeInTheDocument();
    expect(screen.getByText("Ready")).toBeInTheDocument();
    expect(screen.getByText("Based on 3 complete IST months")).toBeInTheDocument();
    expect(screen.getByText("₹50,000.00")).toBeInTheDocument();
    expect(screen.getByText("Full 3-month baseline established")).toBeInTheDocument();

    const breakdownBtn = screen.getByRole("button", { name: /View Breakdown/i });
    expect(breakdownBtn).toBeInTheDocument();
    fireEvent.click(breakdownBtn);

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("Complete Months Baseline")).toBeInTheDocument();
  });

  it("renders limited state with singular month wording and disclaimer", () => {
    mockHookReturn = {
      data: LIMITED_FIXTURE,
      error: null,
      isFetching: false,
      refetch: vi.fn()
    };

    render(<EssentialBurnCard initialData={LIMITED_FIXTURE} />);

    expect(screen.getByText("Limited")).toBeInTheDocument();
    expect(screen.getByText("Based on 1 complete month")).toBeInTheDocument();
    expect(screen.getByText("₹45,000.00")).toBeInTheDocument();
    expect(screen.getByText(/Limited baseline \(1\/3 complete months\)/i)).toBeInTheDocument();
  });

  it("renders unavailable state with honest empty baseline indicator without showing ₹0", () => {
    mockHookReturn = {
      data: UNAVAILABLE_FIXTURE,
      error: null,
      isFetching: false,
      refetch: vi.fn()
    };

    render(<EssentialBurnCard initialData={UNAVAILABLE_FIXTURE} />);

    expect(screen.getByText("Unavailable")).toBeInTheDocument();
    expect(screen.getByText("No complete month history")).toBeInTheDocument();
    expect(screen.getByText("—")).toBeInTheDocument();
    expect(screen.queryByText("₹0.00")).toBeNull();
  });

  it("displays classification limitation warning banner when uncategorized spend exists", () => {
    mockHookReturn = {
      data: CLASSIFICATION_LIMITED_FIXTURE,
      error: null,
      isFetching: false,
      refetch: vi.fn()
    };

    render(<EssentialBurnCard initialData={CLASSIFICATION_LIMITED_FIXTURE} />);

    expect(screen.getByText(/Uncategorized or ungrouped expenses detected/i)).toBeInTheDocument();
    const link = screen.getByRole("link", { name: /Review transactions/i });
    expect(link).toHaveAttribute("href", "/transactions");
  });

  it("masks financial amount when privacy mode is active", () => {
    mockHookReturn = {
      data: COMPLETE_FIXTURE,
      error: null,
      isFetching: false,
      refetch: vi.fn()
    };
    mockPrivacyMode = true;

    render(<EssentialBurnCard initialData={COMPLETE_FIXTURE} />);

    expect(screen.getByText("₹ ••••••")).toBeInTheDocument();
    expect(screen.queryByText("₹50,000.00")).toBeNull();
  });

  it("renders error retry state when data is null and error is present", () => {
    const refetchMock = vi.fn().mockResolvedValue(undefined);
    mockHookReturn = {
      data: null,
      error: new Error("Network error"),
      isFetching: false,
      refetch: refetchMock
    };

    render(<EssentialBurnCard initialData={null} />);

    expect(screen.getByText("Failed to load essential burn baseline.")).toBeInTheDocument();
    const retryBtn = screen.getByRole("button", { name: "Retry" });
    fireEvent.click(retryBtn);
    expect(refetchMock).toHaveBeenCalled();
  });
});
