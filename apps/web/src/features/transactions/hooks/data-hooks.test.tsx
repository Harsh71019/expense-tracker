import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { Transaction, TransactionPage } from "@vyaya/shared";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import { useReverseTxn } from "./use-reverse-txn";
import { useTxnList } from "./use-txn-list";

const mocks = vi.hoisted(() => ({ GET: vi.fn(), POST: vi.fn() }));
vi.mock("@/lib/api/client", () => ({ apiClient: mocks }));

const timestamp = new Date("2026-07-16T00:00:00.000Z");
const transaction: Transaction = {
  id: "3fa85f64-5717-4562-b3fc-2c963f66bef0",
  userId: "user-1",
  accountId: "3fa85f64-5717-4562-b3fc-2c963f66beef",
  type: "expense",
  amountMinor: 2_000,
  occurredAt: timestamp,
  description: "Chai",
  tags: [],
  currency: "INR",
  source: "manual",
  status: "posted",
  createdAt: timestamp,
  updatedAt: timestamp
};
const response = new Response(null, { status: 200 });
const problemResponse = new Response(null, { status: 409 });
const problem = {
  type: "https://vyaya.app/problems/conflict",
  title: "Conflict",
  status: 409,
  detail: "Already reversed",
  instance: "/api/v1/transactions/3fa85f64-5717-4562-b3fc-2c963f66bef0/reverse",
  code: "txn.already_reversed",
  reqId: "request-1",
  timestamp,
  retryable: false,
  errors: null
};
const initialPage: TransactionPage = {
  items: [transaction],
  pageInfo: { nextCursor: "next-page", hasMore: true, limit: 10 }
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

describe("transaction data hooks", () => {
  it("loads another transaction page using its cursor", async () => {
    mocks.GET.mockResolvedValue({
      data: { items: [], pageInfo: { nextCursor: null, hasMore: false, limit: 10 } },
      error: undefined,
      response
    });
    const hook = renderHook(() => useTxnList({ limit: 10, from: timestamp }, initialPage), {
      wrapper
    });

    await waitFor(() => expect(hook.result.current.isSuccess).toBe(true));
    await hook.result.current.fetchNextPage();

    await waitFor(() => expect(mocks.GET).toHaveBeenCalledTimes(1));
    expect(mocks.GET).toHaveBeenCalledWith("/v1/transactions", {
      params: {
        query: expect.objectContaining({
          cursor: "next-page",
          from: timestamp.toISOString(),
          limit: 10
        })
      }
    });
  });

  it("surfaces API errors while loading another page", async () => {
    mocks.GET.mockResolvedValue({
      data: undefined,
      error: { ...problem, detail: "Cursor expired" },
      response: problemResponse
    });
    const hook = renderHook(() => useTxnList({ limit: 10 }, initialPage), { wrapper });

    await waitFor(() => expect(hook.result.current.isSuccess).toBe(true));
    await hook.result.current.fetchNextPage();

    await waitFor(() => expect(hook.result.current.isFetchNextPageError).toBe(true));
    expect(hook.result.current.error?.message).toBe("Cursor expired");
  });

  it("reverses a transaction and invalidates dependent data", async () => {
    mocks.POST.mockResolvedValue({ data: transaction, error: undefined, response });
    const hook = renderHook(() => useReverseTxn(), { wrapper });

    await expect(hook.result.current.mutateAsync(transaction.id)).resolves.toMatchObject({
      id: transaction.id
    });
    expect(mocks.POST).toHaveBeenCalledWith("/v1/transactions/{transactionId}/reverse", {
      params: { path: { transactionId: transaction.id } }
    });
  });

  it("keeps meaningful API errors from a reversal", async () => {
    mocks.POST.mockResolvedValue({
      data: undefined,
      error: problem,
      response: problemResponse
    });
    const hook = renderHook(() => useReverseTxn(), { wrapper });

    await expect(hook.result.current.mutateAsync(transaction.id)).rejects.toThrow(
      "Already reversed"
    );
  });

  it("converts non-Error request failures into network errors", async () => {
    mocks.POST.mockRejectedValue("offline");
    const hook = renderHook(() => useReverseTxn(), { wrapper });

    await expect(hook.result.current.mutateAsync(transaction.id)).rejects.toThrow(
      "The network request failed."
    );
  });
});
