import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook } from "@testing-library/react";
import type { Transaction, TransferReversal } from "@treasury-ops/shared";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useReverseTransfer } from "./use-transfers";

const mocks = vi.hoisted(() => ({
  POST: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn()
}));
vi.mock("@/lib/api/client", () => ({ apiClient: { POST: mocks.POST } }));
vi.mock("@/lib/toast", () => ({
  toast: { success: mocks.toastSuccess, error: mocks.toastError }
}));

const timestamp = new Date("2026-07-16T00:00:00.000Z");
const transaction: Transaction = {
  id: "3fa85f64-5717-4562-b3fc-2c963f66bef0",
  userId: "user-1",
  accountId: "3fa85f64-5717-4562-b3fc-2c963f66beef",
  transferGroupId: "3fa85f64-5717-4562-b3fc-2c963f66be21",
  type: "expense",
  amountMinor: 2_000,
  occurredAt: timestamp,
  description: "Transfer",
  tags: [],
  currency: "INR",
  source: "manual",
  status: "reversal",
  paymentRail: "unknown",
  counterpartyHandle: null,
  createdAt: timestamp,
  updatedAt: timestamp
};
const reversal: TransferReversal = {
  transferGroupId: "3fa85f64-5717-4562-b3fc-2c963f66be22",
  legs: [transaction, { ...transaction, id: "3fa85f64-5717-4562-b3fc-2c963f66bef1" }]
};

function wrapper({ children }: Readonly<{ children: ReactNode }>): ReactNode {
  return (
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { mutations: { retry: false } } })}
    >
      {children}
    </QueryClientProvider>
  );
}

describe("useReverseTransfer", () => {
  beforeEach(() => {
    mocks.POST.mockReset();
    mocks.toastSuccess.mockReset();
    mocks.toastError.mockReset();
  });

  it("toasts a successful transfer reversal", async () => {
    mocks.POST.mockResolvedValue({
      data: reversal,
      error: undefined,
      response: new Response(null, { status: 200 })
    });
    const hook = renderHook(() => useReverseTransfer(), { wrapper });

    await hook.result.current.mutateAsync("3fa85f64-5717-4562-b3fc-2c963f66be21");

    expect(mocks.toastSuccess).toHaveBeenCalledWith("Transfer reversed");
  });

  it("toasts a rejected transfer reversal", async () => {
    mocks.POST.mockRejectedValue(new Error("Transfer already reversed"));
    const hook = renderHook(() => useReverseTransfer(), { wrapper });

    await expect(
      hook.result.current.mutateAsync("3fa85f64-5717-4562-b3fc-2c963f66be21")
    ).rejects.toThrow("Transfer already reversed");
    expect(mocks.toastError).toHaveBeenCalledWith("Transfer already reversed");
  });
});
