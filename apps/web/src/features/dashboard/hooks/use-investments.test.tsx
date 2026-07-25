import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { DashboardInvestments } from "@treasury-ops/shared";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useInvestments } from "./use-investments";

const mocks = vi.hoisted(() => ({ GET: vi.fn() }));
vi.mock("@/lib/api/client", () => ({ apiClient: mocks }));

const wrapper = ({ children }: Readonly<{ children: ReactNode }>): ReactNode => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    {children}
  </QueryClientProvider>
);
const response = new Response(null, { status: 200 });
const timestamp = "2026-07-16T00:00:00.000Z";
const investments: DashboardInvestments = {
  items: [
    {
      assetId: "3fa85f64-5717-4562-b3fc-2c963f66beef",
      name: "Nifty 50 Index",
      kind: "investment",
      currentValueMinor: 1000,
      returnPct: 12.5,
      series: [{ valuedAt: new Date(timestamp), valueMinor: 1000 }]
    }
  ]
};

describe("useInvestments", () => {
  beforeEach(() => {
    mocks.GET.mockReset();
  });

  it("loads and parses investments", async () => {
    mocks.GET.mockResolvedValue({ data: investments, error: undefined, response });
    const hook = renderHook(() => useInvestments(), { wrapper });

    await waitFor(() => expect(hook.result.current.data?.items[0]?.name).toBe("Nifty 50 Index"));
    expect(mocks.GET).toHaveBeenCalledWith("/v1/dashboard/investments");
  });

  it("rejects malformed payloads", async () => {
    mocks.GET.mockResolvedValue({ data: { items: [{ name: "Bad" }] }, error: undefined, response });
    const hook = renderHook(() => useInvestments(), { wrapper });

    await waitFor(() => expect(hook.result.current.isError).toBe(true));
    expect(hook.result.current.error?.message).toBe("The request could not be completed.");
  });

  it("hydrates from initial data without refetching immediately", () => {
    const hook = renderHook(() => useInvestments(investments), { wrapper });
    expect(hook.result.current.data).toEqual(investments);
  });
});
