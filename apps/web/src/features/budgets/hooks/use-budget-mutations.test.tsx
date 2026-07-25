import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { Budget } from "@treasury-ops/shared";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import { useUpsertBudget } from "./use-budget-mutations";

const mocks = vi.hoisted(() => ({
  PUT: vi.fn()
}));

vi.mock("@/lib/api/client", () => ({
  apiClient: mocks
}));

const budget: Budget = {
  id: "3fa85f64-5717-4562-b3fc-2c963f66be00",
  userId: "user-1",
  categoryId: "3fa85f64-5717-4562-b3fc-2c963f66be01",
  limitMinor: 500_000,
  isArchived: false,
  createdAt: new Date("2026-07-01T00:00:00.000Z"),
  updatedAt: new Date("2026-07-01T00:00:00.000Z")
};

function wrapper(): (props: { children: ReactNode }) => ReactNode {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } }
  });
  function Wrapper({ children }: { children: ReactNode }): ReactNode {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  }
  return Wrapper;
}

describe("useUpsertBudget", () => {
  it("reuses its mounted idempotency key after failure and rotates it after success", async () => {
    mocks.PUT.mockRejectedValueOnce(new TypeError("offline"))
      .mockResolvedValue({ data: budget, error: undefined, response: { status: 200 } })
      .mockResolvedValue({ data: budget, error: undefined, response: { status: 200 } });
    const { result } = renderHook(() => useUpsertBudget(), { wrapper: wrapper() });
    const request = { categoryId: budget.categoryId, input: { limitMinor: budget.limitMinor } };

    await expect(act(async () => result.current.mutateAsync(request))).rejects.toThrow("offline");
    await act(async () => result.current.mutateAsync(request));
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const firstKey = mocks.PUT.mock.calls[0]?.[1].params.header["Idempotency-Key"];
    const retryKey = mocks.PUT.mock.calls[1]?.[1].params.header["Idempotency-Key"];
    expect(retryKey).toBe(firstKey);

    await act(async () => result.current.mutateAsync(request));
    const nextKey = mocks.PUT.mock.calls[2]?.[1].params.header["Idempotency-Key"];
    expect(nextKey).not.toBe(retryKey);
  });
});
