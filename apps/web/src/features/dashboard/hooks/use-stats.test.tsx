import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { DashboardStats } from "@treasury-ops/shared";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useStats } from "./use-stats";

const mocks = vi.hoisted(() => ({ GET: vi.fn() }));
vi.mock("@/lib/api/client", () => ({ apiClient: mocks }));

const wrapper = ({ children }: Readonly<{ children: ReactNode }>): ReactNode => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    {children}
  </QueryClientProvider>
);
const response = new Response(null, { status: 200 });
const timestamp = new Date("2026-07-16T00:00:00.000Z");
const problemResponse = new Response(null, { status: 422 });
const problem = {
  type: "https://treasury-ops.app/problems/validation",
  title: "Validation failed",
  status: 422,
  detail: "Check your entry",
  instance: "/api/v1/dashboard/stats",
  code: "common.validation_failed",
  reqId: "request-1",
  timestamp,
  retryable: false,
  errors: null
};
const stats: DashboardStats = {
  period: "2026-07",
  spent: { valueMinor: 100, deltaPct: -5, trend: [120, 110, 100] },
  income: { valueMinor: 500, deltaPct: 5, trend: [480, 490, 500] },
  savingsRate: { valuePct: 30, deltaPct: 2, trend: [28, 29, 30] },
  netWorth: { valueMinor: 10_000, deltaPct: 1, trend: [9900, 9950, 10000] }
};

describe("useStats", () => {
  beforeEach(() => {
    mocks.GET.mockReset();
  });

  it("loads and parses dashboard stats", async () => {
    mocks.GET.mockResolvedValue({ data: stats, error: undefined, response });
    const hook = renderHook(() => useStats(), { wrapper });

    await waitFor(() => expect(hook.result.current.data?.period).toBe("2026-07"));
    expect(mocks.GET).toHaveBeenCalledWith("/v1/dashboard/stats");
  });

  it("reports API and transport failures", async () => {
    mocks.GET.mockResolvedValueOnce({ data: undefined, error: problem, response: problemResponse });
    const apiFailure = renderHook(() => useStats(), { wrapper });
    await waitFor(() => expect(apiFailure.result.current.isError).toBe(true));
    expect(apiFailure.result.current.error?.message).toBe("Check your entry");

    mocks.GET.mockRejectedValueOnce("offline");
    const transportFailure = renderHook(() => useStats(), { wrapper });
    await waitFor(() => expect(transportFailure.result.current.isError).toBe(true));
    expect(transportFailure.result.current.error?.message).toBe("The network request failed.");
  });

  it("rejects malformed payloads", async () => {
    mocks.GET.mockResolvedValue({ data: { period: "invalid" }, error: undefined, response });
    const hook = renderHook(() => useStats(), { wrapper });

    await waitFor(() => expect(hook.result.current.isError).toBe(true));
    expect(hook.result.current.error?.message).toBe("The request could not be completed.");
  });

  it("hydrates from initial data without refetching immediately", () => {
    const hook = renderHook(() => useStats(stats), { wrapper });
    expect(hook.result.current.data).toEqual(stats);
  });

  it("ignores a null initial value and fetches instead", async () => {
    mocks.GET.mockResolvedValue({ data: stats, error: undefined, response });
    const hook = renderHook(() => useStats(null), { wrapper });
    await waitFor(() => expect(hook.result.current.data?.period).toBe("2026-07"));
  });
});
