import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { TopSpendingItem } from "@treasury-ops/shared";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useTopSpending } from "./use-top-spending";

const mocks = vi.hoisted(() => ({ GET: vi.fn() }));
vi.mock("@/lib/api/client", () => ({ apiClient: mocks }));

const wrapper = ({ children }: Readonly<{ children: ReactNode }>): ReactNode => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    {children}
  </QueryClientProvider>
);
const response = new Response(null, { status: 200 });
const items: TopSpendingItem[] = [{ name: "Groceries", amountMinor: 500, txnCount: 4 }];

describe("useTopSpending", () => {
  beforeEach(() => {
    mocks.GET.mockReset();
  });

  it("loads and parses top spending for the given range and limit", async () => {
    mocks.GET.mockResolvedValue({ data: items, error: undefined, response });
    const hook = renderHook(() => useTopSpending("1M", 6), { wrapper });

    await waitFor(() => expect(hook.result.current.data?.[0]?.name).toBe("Groceries"));
    expect(mocks.GET).toHaveBeenCalledWith(
      "/v1/dashboard/top-spending",
      expect.objectContaining({ params: { query: { range: "1M", limit: 6 } } })
    );
  });

  it("rejects malformed payloads", async () => {
    mocks.GET.mockResolvedValue({ data: [{ name: "Bad" }], error: undefined, response });
    const hook = renderHook(() => useTopSpending("1M", 6), { wrapper });

    await waitFor(() => expect(hook.result.current.isError).toBe(true));
    expect(hook.result.current.error?.message).toBe("The request could not be completed.");
  });

  it("hydrates from initial data without refetching immediately", () => {
    const hook = renderHook(() => useTopSpending("1M", 6, items), { wrapper });
    expect(hook.result.current.data).toEqual(items);
  });
});
