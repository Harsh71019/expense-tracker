import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { EssentialBurnResponse } from "@treasury-ops/shared";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import { useEssentialBurn } from "./use-essential-burn";

const mocks = vi.hoisted(() => ({ GET: vi.fn() }));
vi.mock("@/lib/api/client", () => ({ apiClient: mocks }));

const FIXTURE: EssentialBurnResponse = {
  computedAt: new Date("2026-08-18T10:00:00.000Z"),
  asOf: new Date("2026-08-18T10:00:00.000Z"),
  sourceThrough: new Date("2026-08-18T10:00:00.000Z"),
  formulaVersion: 1,
  timezone: "Asia/Kolkata",
  requiredCompleteMonths: 3,
  observedCompleteMonthCount: 3,
  averageMonthlyEssentialMinor: 50_000,
  quality: "complete",
  completeMonths: [
    {
      month: "2026-05",
      observation: "observed",
      essentialTotalMinor: 50_000,
      eligibleExpenseTransactionCount: 5,
      essentialTransactionCount: 3
    },
    {
      month: "2026-06",
      observation: "observed",
      essentialTotalMinor: 50_000,
      eligibleExpenseTransactionCount: 5,
      essentialTransactionCount: 3
    },
    {
      month: "2026-07",
      observation: "observed",
      essentialTotalMinor: 50_000,
      eligibleExpenseTransactionCount: 5,
      essentialTransactionCount: 3
    }
  ],
  currentPartialMonth: {
    month: "2026-08",
    essentialTotalMinor: 20_000,
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
    categorizedExpenseMinor: 150_000,
    unclassifiedExpenseMinor: 0,
    coverageRatioBps: 10000,
    currentCategoryMetadataInUse: true
  },
  limitations: ["current_category_metadata_in_use"]
};

function wrapper({ children }: Readonly<{ children: ReactNode }>): ReactNode {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } }
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe("useEssentialBurn hook", () => {
  it("returns initialData immediately when provided", () => {
    const { result } = renderHook(() => useEssentialBurn(FIXTURE), { wrapper });
    expect(result.current.data).toEqual(FIXTURE);
  });

  it("fetches data and parses response when initialData is null", async () => {
    mocks.GET.mockResolvedValueOnce({
      data: {
        ...FIXTURE,
        computedAt: FIXTURE.computedAt.toISOString(),
        asOf: FIXTURE.asOf.toISOString(),
        sourceThrough: FIXTURE.sourceThrough.toISOString()
      },
      error: undefined,
      response: { status: 200 }
    });

    const { result } = renderHook(() => useEssentialBurn(null), { wrapper });

    await waitFor(() => expect(result.current.data?.quality).toBe("complete"));
    expect(result.current.data?.averageMonthlyEssentialMinor).toBe(50_000);
    expect(mocks.GET).toHaveBeenCalledWith("/v1/financial-safety/essential-burn", {
      params: { query: {} }
    });
  });
});
