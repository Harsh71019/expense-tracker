import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { MonthlySpending } from "@treasury-ops/shared";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useMonthlySpending } from "./use-monthly-spending";

const mocks = vi.hoisted(() => ({ GET: vi.fn() }));
vi.mock("@/lib/api/client", () => ({ apiClient: mocks }));

const wrapper = ({ children }: Readonly<{ children: ReactNode }>): ReactNode => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    {children}
  </QueryClientProvider>
);
const response = new Response(null, { status: 200 });
const spending: MonthlySpending = {
  period: "2026-08",
  asOf: new Date("2026-08-03T06:00:00.000Z"),
  totalMinor: 1_500,
  daily: [],
  weekly: []
};

describe("useMonthlySpending", () => {
  beforeEach(() => {
    mocks.GET.mockReset();
  });

  it("loads and parses monthly spending", async () => {
    mocks.GET.mockResolvedValue({ data: spending, error: undefined, response });
    const hook = renderHook(() => useMonthlySpending(), { wrapper });

    await waitFor(() => expect(hook.result.current.data?.totalMinor).toBe(1_500));
    expect(mocks.GET).toHaveBeenCalledWith("/v1/dashboard/monthly-spending");
  });

  it("rejects malformed payloads", async () => {
    mocks.GET.mockResolvedValue({
      data: { ...spending, totalMinor: 1.5 },
      error: undefined,
      response
    });
    const hook = renderHook(() => useMonthlySpending(), { wrapper });

    await waitFor(() => expect(hook.result.current.isError).toBe(true));
  });

  it("hydrates from initial data", () => {
    const hook = renderHook(() => useMonthlySpending(spending), { wrapper });
    expect(hook.result.current.data).toEqual(spending);
  });
});
