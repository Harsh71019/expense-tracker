import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { CashflowResponse } from "@treasury-ops/shared";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useCashflow } from "./use-cashflow";

const mocks = vi.hoisted(() => ({ GET: vi.fn() }));
vi.mock("@/lib/api/client", () => ({ apiClient: mocks }));

const wrapper = ({ children }: Readonly<{ children: ReactNode }>): ReactNode => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    {children}
  </QueryClientProvider>
);
const response = new Response(null, { status: 200 });
const cashflow: CashflowResponse = {
  range: "6M",
  buckets: [{ label: "Jul", incomeMinor: 100, expenseMinor: 50 }]
};

describe("useCashflow", () => {
  beforeEach(() => {
    mocks.GET.mockReset();
  });

  it("loads and parses cashflow for the given range", async () => {
    mocks.GET.mockResolvedValue({ data: cashflow, error: undefined, response });
    const hook = renderHook(() => useCashflow("6M"), { wrapper });

    await waitFor(() => expect(hook.result.current.data?.buckets).toHaveLength(1));
    expect(mocks.GET).toHaveBeenCalledWith(
      "/v1/dashboard/cashflow",
      expect.objectContaining({ params: { query: { range: "6M" } } })
    );
  });

  it("rejects malformed payloads", async () => {
    mocks.GET.mockResolvedValue({ data: { range: "6M" }, error: undefined, response });
    const hook = renderHook(() => useCashflow("6M"), { wrapper });

    await waitFor(() => expect(hook.result.current.isError).toBe(true));
    expect(hook.result.current.error?.message).toBe("The request could not be completed.");
  });

  it("hydrates from initial data without refetching immediately", () => {
    const hook = renderHook(() => useCashflow("6M", cashflow), { wrapper });
    expect(hook.result.current.data).toEqual(cashflow);
  });
});
