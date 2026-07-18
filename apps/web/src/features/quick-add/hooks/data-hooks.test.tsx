import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import { useAccounts } from "./use-accounts";
import { useCategories } from "./use-categories";
import { useCreateTxn } from "./use-create-txn";
import { useCreateAccount } from "./use-create-account";

const mocks = vi.hoisted(() => ({ GET: vi.fn(), POST: vi.fn() }));
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
  type: "https://vyaya.app/problems/validation",
  title: "Validation failed",
  status: 422,
  detail: "Check your entry",
  instance: "/api/v1/transactions",
  code: "common.validation_failed",
  reqId: "request-1",
  timestamp,
  retryable: false,
  errors: null
};
const account = {
  id: "507f1f77bcf86cd799439011",
  userId: "user-1",
  name: "Cash",
  type: "cash",
  openingBalanceMinor: 0,
  balanceMinor: 0,
  currency: "INR",
  isArchived: false,
  createdAt: timestamp,
  updatedAt: timestamp
};
const category = {
  id: "507f1f77bcf86cd799439012",
  userId: "user-1",
  name: "Tea",
  kind: "expense",
  isArchived: false,
  createdAt: timestamp,
  updatedAt: timestamp
};
const transaction = {
  id: "507f1f77bcf86cd799439013",
  userId: "user-1",
  accountId: account.id,
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

describe("quick-add data hooks", () => {
  it("loads and parses accounts and categories", async () => {
    mocks.GET.mockImplementation((path: string) =>
      Promise.resolve({ data: path === "/v1/accounts" ? [account] : [category], response })
    );
    const accounts = renderHook(() => useAccounts(), { wrapper });
    const categories = renderHook(() => useCategories(), { wrapper });
    await waitFor(() => expect(accounts.result.current.data?.[0]?.name).toBe("Cash"));
    await waitFor(() => expect(categories.result.current.data?.[0]?.name).toBe("Tea"));
  });

  it("posts ISO dates with the supplied idempotency key", async () => {
    mocks.POST.mockResolvedValue({ data: transaction, error: undefined, response });
    const hook = renderHook(() => useCreateTxn(), { wrapper });
    await hook.result.current.mutateAsync({
      accountId: account.id,
      type: "expense",
      amountMinor: 2_000,
      occurredAt: new Date("2026-07-16T00:00:00.000Z"),
      description: "Chai",
      tags: [],
      idempotencyKey: "11111111-1111-4111-8111-111111111111"
    });
    expect(mocks.POST).toHaveBeenCalledWith(
      "/v1/transactions",
      expect.objectContaining({
        params: { header: { "Idempotency-Key": "11111111-1111-4111-8111-111111111111" } }
      })
    );
  });

  it("reports API and transport failures from lookup queries", async () => {
    mocks.GET.mockResolvedValueOnce({ data: undefined, error: problem, response: problemResponse });
    mocks.GET.mockRejectedValueOnce("offline");
    const accounts = renderHook(() => useAccounts(), { wrapper });
    const categories = renderHook(() => useCategories(), { wrapper });

    await waitFor(() => expect(accounts.result.current.isError).toBe(true));
    await waitFor(() => expect(categories.result.current.isError).toBe(true));
    expect(accounts.result.current.error?.message).toBe("Check your entry");
    expect(categories.result.current.error?.message).toBe("The network request failed.");
  });

  it("rejects malformed transaction responses", async () => {
    mocks.POST.mockResolvedValue({ data: { id: "invalid" }, error: undefined, response });
    const hook = renderHook(() => useCreateTxn(), { wrapper });

    await expect(
      hook.result.current.mutateAsync({
        accountId: account.id,
        categoryId: category.id,
        type: "expense",
        amountMinor: 2_000,
        occurredAt: timestamp,
        description: "Chai",
        tags: [],
        idempotencyKey: "11111111-1111-4111-8111-111111111111"
      })
    ).rejects.toThrow("The request could not be completed.");
  });

  it("rejects malformed category payloads", async () => {
    mocks.GET.mockResolvedValue({ data: [{ id: "invalid" }], error: undefined, response });
    const categories = renderHook(() => useCategories(), { wrapper });

    await waitFor(() => expect(categories.result.current.isError).toBe(true));
    expect(categories.result.current.error?.message).toBe("The request could not be completed.");
  });

  it("preserves API and transport failures when posting", async () => {
    mocks.POST.mockResolvedValueOnce({
      data: undefined,
      error: problem,
      response: problemResponse
    });
    mocks.POST.mockRejectedValueOnce("offline");
    const apiFailure = renderHook(() => useCreateTxn(), { wrapper });
    const transportFailure = renderHook(() => useCreateTxn(), { wrapper });
    const input = {
      accountId: account.id,
      type: "expense" as const,
      amountMinor: 2_000,
      occurredAt: timestamp,
      description: "Chai",
      tags: [],
      idempotencyKey: "11111111-1111-4111-8111-111111111111"
    };

    await expect(apiFailure.result.current.mutateAsync(input)).rejects.toThrow("Check your entry");
    await expect(transportFailure.result.current.mutateAsync(input)).rejects.toThrow(
      "The network request failed."
    );
  });

  it("creates an account and refreshes account data", async () => {
    mocks.POST.mockResolvedValue({ data: account, error: undefined, response });
    const hook = renderHook(() => useCreateAccount(), { wrapper });

    await expect(
      hook.result.current.mutateAsync({ name: "Cash", type: "cash", openingBalanceMinor: 0 })
    ).resolves.toMatchObject({ name: "Cash" });
    expect(mocks.POST).toHaveBeenCalledWith(
      "/v1/accounts",
      expect.objectContaining({
        body: { name: "Cash", type: "cash", openingBalanceMinor: 0 },
        params: { header: { "Idempotency-Key": expect.any(String) } }
      })
    );
  });

  it("preserves account API and transport failures", async () => {
    mocks.POST.mockResolvedValueOnce({
      data: undefined,
      error: problem,
      response: problemResponse
    });
    mocks.POST.mockRejectedValueOnce("offline");
    const apiFailure = renderHook(() => useCreateAccount(), { wrapper });
    const transportFailure = renderHook(() => useCreateAccount(), { wrapper });
    const input = { name: "Cash", type: "cash" as const, openingBalanceMinor: 0 };

    await expect(apiFailure.result.current.mutateAsync(input)).rejects.toThrow("Check your entry");
    await expect(transportFailure.result.current.mutateAsync(input)).rejects.toThrow(
      "The network request failed."
    );
  });
});
