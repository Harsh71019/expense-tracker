import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { NetWorth } from "@treasury-ops/shared";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import { useNetWorth } from "./use-net-worth";

const mocks = vi.hoisted(() => ({ GET: vi.fn() }));

vi.mock("@/lib/api/client", () => ({
  apiClient: mocks
}));

const sampleNetWorth: NetWorth = {
  asOf: new Date("2026-01-01T00:00:00.000Z"),
  netWorthMinor: 500_000,
  accounts: [
    { accountId: "3fa85f64-5717-4562-b3fc-2c963f66beef", name: "Cash", balanceMinor: 100_000 }
  ],
  assets: [],
  receivables: []
};

function wrapper(): (props: { children: ReactNode }) => ReactNode {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  function Wrapper({ children }: { children: ReactNode }): ReactNode {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  }
  return Wrapper;
}

describe("useNetWorth", () => {
  it("seeds from initialData without waiting on a fetch", () => {
    const { result } = renderHook(() => useNetWorth(sampleNetWorth), { wrapper: wrapper() });

    expect(result.current.data).toEqual(sampleNetWorth);
  });

  it("fetches and returns the parsed net worth when no initialData is given", async () => {
    mocks.GET.mockResolvedValue({
      data: { ...sampleNetWorth, netWorthMinor: 750_000 },
      error: undefined,
      response: { status: 200 }
    });

    const { result } = renderHook(() => useNetWorth(), { wrapper: wrapper() });

    await waitFor(() => expect(result.current.data?.netWorthMinor).toBe(750_000));
    expect(mocks.GET).toHaveBeenCalledWith("/v1/net-worth");
  });

  it("throws an app error on an API error response", async () => {
    mocks.GET.mockResolvedValue({
      data: undefined,
      error: { title: "Failed", status: 500 },
      response: { status: 500 }
    });

    const { result } = renderHook(() => useNetWorth(), { wrapper: wrapper() });

    await waitFor(() => expect(result.current.isError).toBe(true));
  });

  it("throws an app error when the response fails schema validation", async () => {
    mocks.GET.mockResolvedValue({
      data: { netWorthMinor: "not-a-number" },
      error: undefined,
      response: { status: 200 }
    });

    const { result } = renderHook(() => useNetWorth(), { wrapper: wrapper() });

    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});
