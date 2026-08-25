import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReserveSourcePage } from "@treasury-ops/shared";
import type { ReactNode } from "react";
import { describe, expect, it } from "vitest";
import { vi } from "vitest";

import { useReserveSources } from "./use-reserve-sources";

const mocks = vi.hoisted(() => ({ GET: vi.fn() }));
vi.mock("@/lib/api/client", () => ({ apiClient: mocks }));

const FIXTURE: ReserveSourcePage = {
  items: [
    {
      sourceKind: "account",
      sourceId: "11111111-1111-4111-8111-111111111111",
      displayName: "HDFC Savings",
      sourceType: "bank",
      configuration: null,
      currentValueMinor: 100_000,
      valuedAt: null,
      freshness: "not_applicable",
      eligibleMinor: 0,
      eligibility: "ineligible",
      exclusionReason: "not_configured",
      isUnavailable: false,
      lastUpdatedAt: new Date("2026-08-01T00:00:00.000Z")
    }
  ],
  pageInfo: { nextCursor: null, hasMore: false, limit: 200 }
};

function wrapper({ children }: Readonly<{ children: ReactNode }>): ReactNode {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe("useReserveSources hook", () => {
  it("returns initialData immediately when provided", () => {
    const { result } = renderHook(() => useReserveSources(FIXTURE), { wrapper });
    expect(result.current.data).toEqual(FIXTURE);
  });

  it("fetches and parses the response when initialData is null", async () => {
    mocks.GET.mockReset().mockResolvedValueOnce({
      data: {
        items: FIXTURE.items.map((item) => ({
          ...item,
          lastUpdatedAt: item.lastUpdatedAt?.toISOString() ?? null
        })),
        pageInfo: FIXTURE.pageInfo
      },
      error: undefined,
      response: { status: 200 }
    });

    const { result } = renderHook(() => useReserveSources(null), { wrapper });

    await waitFor(() => expect(result.current.data?.items).toHaveLength(1));
    expect(mocks.GET).toHaveBeenCalledWith("/v1/financial-safety/reserve-sources", {
      params: { query: { limit: 200 } }
    });
  });

  it("fails closed to null on a schema mismatch rather than passing unchecked data", async () => {
    mocks.GET.mockReset().mockResolvedValueOnce({
      data: { items: "not-an-array" },
      error: undefined,
      response: { status: 200 }
    });

    const { result } = renderHook(() => useReserveSources(null), { wrapper });

    await waitFor(() => expect(result.current.isFetched).toBe(true));
    expect(result.current.data).toBeNull();
  });
});
