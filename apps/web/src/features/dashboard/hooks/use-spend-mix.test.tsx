import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { SpendMix } from "@treasury-ops/shared";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useSpendMix } from "./use-spend-mix";

const mocks = vi.hoisted(() => ({ GET: vi.fn() }));
vi.mock("@/lib/api/client", () => ({ apiClient: mocks }));

const wrapper = ({ children }: Readonly<{ children: ReactNode }>): ReactNode => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    {children}
  </QueryClientProvider>
);
const response = new Response(null, { status: 200 });
const spendMix: SpendMix = {
  range: "1M",
  totalMinor: 100,
  essential: { amountMinor: 60, pct: 60 },
  lifestyle: { amountMinor: 40, pct: 40 },
  uncategorized: { amountMinor: 0, pct: 0 }
};

describe("useSpendMix", () => {
  beforeEach(() => {
    mocks.GET.mockReset();
  });

  it("loads and parses spend mix for the given range", async () => {
    mocks.GET.mockResolvedValue({ data: spendMix, error: undefined, response });
    const hook = renderHook(() => useSpendMix("1M"), { wrapper });

    await waitFor(() => expect(hook.result.current.data?.totalMinor).toBe(100));
    expect(mocks.GET).toHaveBeenCalledWith(
      "/v1/dashboard/spend-mix",
      expect.objectContaining({ params: { query: { range: "1M" } } })
    );
  });

  it("rejects malformed payloads", async () => {
    mocks.GET.mockResolvedValue({ data: { range: "1M" }, error: undefined, response });
    const hook = renderHook(() => useSpendMix("1M"), { wrapper });

    await waitFor(() => expect(hook.result.current.isError).toBe(true));
    expect(hook.result.current.error?.message).toBe("The request could not be completed.");
  });

  it("hydrates from initial data without refetching immediately", () => {
    const hook = renderHook(() => useSpendMix("1M", spendMix), { wrapper });
    expect(hook.result.current.data).toEqual(spendMix);
  });
});
