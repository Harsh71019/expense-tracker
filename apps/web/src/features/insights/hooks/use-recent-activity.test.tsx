import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { RecentActivityItem } from "@treasury-ops/shared";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useRecentActivity } from "./use-recent-activity";

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
  instance: "/api/v1/dashboard/recent-activity",
  code: "common.validation_failed",
  reqId: "request-1",
  timestamp,
  retryable: false,
  errors: null
};
const item: RecentActivityItem = {
  id: "3fa85f64-5717-4562-b3fc-2c963f66beef",
  accountId: "3fa85f64-5717-4562-b3fc-2c963f66bef0",
  accountName: "Cash",
  type: "expense",
  amountMinor: 4_500,
  description: "Swiggy order",
  occurredAt: timestamp,
  tags: []
};

describe("useRecentActivity", () => {
  beforeEach(() => {
    mocks.GET.mockReset();
  });

  it("loads and parses recent activity", async () => {
    mocks.GET.mockResolvedValue({ data: [item], error: undefined, response });
    const hook = renderHook(() => useRecentActivity(5), { wrapper });

    await waitFor(() => expect(hook.result.current.data?.[0]?.description).toBe("Swiggy order"));
    expect(mocks.GET).toHaveBeenCalledWith(
      "/v1/dashboard/recent-activity",
      expect.objectContaining({ params: { query: { limit: 5 } } })
    );
  });

  it("reports API and transport failures", async () => {
    mocks.GET.mockResolvedValueOnce({ data: undefined, error: problem, response: problemResponse });
    const apiFailure = renderHook(() => useRecentActivity(5), { wrapper });
    await waitFor(() => expect(apiFailure.result.current.isError).toBe(true));
    expect(apiFailure.result.current.error?.message).toBe("Check your entry");

    mocks.GET.mockRejectedValueOnce("offline");
    const transportFailure = renderHook(() => useRecentActivity(5), { wrapper });
    await waitFor(() => expect(transportFailure.result.current.isError).toBe(true));
    expect(transportFailure.result.current.error?.message).toBe("The network request failed.");
  });

  it("rejects malformed payloads", async () => {
    mocks.GET.mockResolvedValue({ data: [{ id: "invalid" }], error: undefined, response });
    const hook = renderHook(() => useRecentActivity(5), { wrapper });

    await waitFor(() => expect(hook.result.current.isError).toBe(true));
    expect(hook.result.current.error?.message).toBe("The request could not be completed.");
  });

  it("hydrates from initial data without refetching immediately", () => {
    const hook = renderHook(() => useRecentActivity(5, [item]), { wrapper });
    expect(hook.result.current.data).toEqual([item]);
  });
});
