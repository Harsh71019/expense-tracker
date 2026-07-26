import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { SpendingWarningPage } from "@treasury-ops/shared";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useDismissSpendingWarning } from "./use-dismiss-spending-warning";
import { useSpendingWarnings } from "./use-spending-warnings";

const mocks = vi.hoisted(() => ({ GET: vi.fn(), POST: vi.fn() }));
vi.mock("@/lib/api/client", () => ({ apiClient: mocks }));

beforeEach(() => {
  mocks.GET.mockReset();
  mocks.POST.mockReset();
});

const response = new Response(null, { status: 200 });
const problemResponse = new Response(null, { status: 409 });
const problem = {
  type: "https://treasury-ops.app/problems/conflict",
  title: "Conflict",
  status: 409,
  detail: "Could not dismiss",
  instance: "/api/v1/spending-warnings/3fa85f64-5717-4562-b3fc-2c963f66be01/dismiss",
  code: "common.internal",
  reqId: "request-1",
  timestamp: new Date(),
  retryable: false,
  errors: null
};

const initialPage: SpendingWarningPage = {
  items: [],
  pageInfo: { nextCursor: "next-page", hasMore: true, limit: 20 },
  analysis: { status: "ready", eligibleKinds: [], baselineExpenseCount: 10 }
};

function wrapper({ children }: Readonly<{ children: ReactNode }>): ReactNode {
  return (
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } })
      }
    >
      {children}
    </QueryClientProvider>
  );
}

describe("useSpendingWarnings", () => {
  it("loads another page using its cursor", async () => {
    mocks.GET.mockResolvedValue({
      data: {
        items: [],
        pageInfo: { nextCursor: null, hasMore: false, limit: 20 },
        analysis: initialPage.analysis
      },
      error: undefined,
      response
    });
    const hook = renderHook(() => useSpendingWarnings({ filter: "all" }, initialPage), { wrapper });

    await waitFor(() => expect(hook.result.current.isSuccess).toBe(true));
    await hook.result.current.fetchNextPage();

    await waitFor(() => expect(mocks.GET).toHaveBeenCalledTimes(1));
    expect(mocks.GET).toHaveBeenCalledWith("/v1/spending-warnings", {
      params: { query: expect.objectContaining({ cursor: "next-page", limit: 20 }) }
    });
  });

  it("sends the mapped kind filter for large_expenses", async () => {
    mocks.GET.mockResolvedValue({ data: initialPage, error: undefined, response });
    const hook = renderHook(() => useSpendingWarnings({ filter: "large_expenses" }, null), {
      wrapper
    });

    await waitFor(() => expect(hook.result.current.isSuccess).toBe(true));
    expect(mocks.GET).toHaveBeenCalledWith("/v1/spending-warnings", {
      params: {
        query: expect.objectContaining({ kind: "unusually_large_expense", limit: 20 })
      }
    });
  });

  it("surfaces a load error when there is no initial page to fall back on", async () => {
    mocks.GET.mockResolvedValue({
      data: undefined,
      error: { ...problem, detail: "Down for maintenance" },
      response: problemResponse
    });
    const hook = renderHook(() => useSpendingWarnings({ filter: "all" }, null), { wrapper });

    await waitFor(() => expect(hook.result.current.isError).toBe(true));
    expect(hook.result.current.data).toBeUndefined();
  });
});

describe("useDismissSpendingWarning", () => {
  it("reuses the same idempotency key across a retry", async () => {
    mocks.POST.mockResolvedValueOnce({
      data: undefined,
      error: problem,
      response: problemResponse
    });
    mocks.POST.mockResolvedValueOnce({
      data: {
        id: "3fa85f64-5717-4562-b3fc-2c963f66be01",
        status: "dismissed",
        dismissedAt: new Date()
      },
      error: undefined,
      response
    });

    const hook = renderHook(() => useDismissSpendingWarning(), { wrapper });

    await expect(hook.result.current.mutateAsync("warning-1")).rejects.toThrow("Could not dismiss");
    await hook.result.current.mutateAsync("warning-1");

    expect(mocks.POST).toHaveBeenCalledTimes(2);
    const firstKey = mocks.POST.mock.calls[0]?.[1]?.params?.header?.["Idempotency-Key"];
    const secondKey = mocks.POST.mock.calls[1]?.[1]?.params?.header?.["Idempotency-Key"];
    expect(firstKey).toBeDefined();
    expect(secondKey).toBe(firstKey);
  });

  it("rotates the idempotency key for a new action after a success", async () => {
    mocks.POST.mockResolvedValue({
      data: {
        id: "3fa85f64-5717-4562-b3fc-2c963f66be01",
        status: "dismissed",
        dismissedAt: new Date()
      },
      error: undefined,
      response
    });

    const hook = renderHook(() => useDismissSpendingWarning(), { wrapper });
    // The idempotency key rotates inside onSuccess, a React state update
    // that can commit on a microtask after mutateAsync's own promise
    // resolves — wrap in act() so it's flushed before the next call reads
    // the (by-then-rotated) key.
    await act(async () => {
      await hook.result.current.mutateAsync("warning-1");
    });
    await hook.result.current.mutateAsync("warning-2");

    const firstKey = mocks.POST.mock.calls[0]?.[1]?.params?.header?.["Idempotency-Key"];
    const secondKey = mocks.POST.mock.calls[1]?.[1]?.params?.header?.["Idempotency-Key"];
    expect(secondKey).not.toBe(firstKey);
  });

  it("converts non-Error request failures into network errors", async () => {
    mocks.POST.mockRejectedValue("offline");
    const hook = renderHook(() => useDismissSpendingWarning(), { wrapper });

    await expect(hook.result.current.mutateAsync("warning-1")).rejects.toThrow(
      "The network request failed."
    );
  });
});
