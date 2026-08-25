import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReserveSummary } from "@treasury-ops/shared";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import { useReserveSummary } from "./use-reserve-summary";

const mocks = vi.hoisted(() => ({ GET: vi.fn() }));
vi.mock("@/lib/api/client", () => ({ apiClient: mocks }));

const FIXTURE: ReserveSummary = {
  computedAt: new Date("2026-08-18T00:00:00.000Z"),
  asOf: new Date("2026-08-18T00:00:00.000Z"),
  sourceThrough: new Date("2026-08-18T00:00:00.000Z"),
  formulaVersion: 1,
  policyVersion: 1,
  timezone: "Asia/Kolkata",
  configuredSourceCount: 2,
  currentlyEligibleSourceCount: 1,
  instantMinor: 100_000,
  tPlusOneMinor: 0,
  totalEligibleMinor: 100_000,
  lockedMinor: 50_000,
  staleExcludedMinor: 0,
  missingValueSourceCount: 0,
  staleSourceCount: 0,
  excludedSourceCount: 1,
  limitations: ["locked_sources_present"]
};

function wrapper({ children }: Readonly<{ children: ReactNode }>): ReactNode {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe("useReserveSummary hook", () => {
  it("returns initialData immediately when provided", () => {
    const { result } = renderHook(() => useReserveSummary(FIXTURE), { wrapper });
    expect(result.current.data).toEqual(FIXTURE);
  });

  it("fetches and parses the aggregate when initialData is null", async () => {
    mocks.GET.mockReset().mockResolvedValueOnce({
      data: {
        ...FIXTURE,
        computedAt: FIXTURE.computedAt.toISOString(),
        asOf: FIXTURE.asOf.toISOString(),
        sourceThrough: FIXTURE.sourceThrough.toISOString()
      },
      error: undefined,
      response: { status: 200 }
    });

    const { result } = renderHook(() => useReserveSummary(null), { wrapper });

    await waitFor(() => expect(result.current.data?.totalEligibleMinor).toBe(100_000));
    expect(mocks.GET).toHaveBeenCalledWith("/v1/financial-safety/reserves", {
      params: { query: {} }
    });
  });
});
