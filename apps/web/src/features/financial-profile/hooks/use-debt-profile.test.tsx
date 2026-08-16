import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { DeclaredDebt } from "@treasury-ops/shared";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import { useCreateDeclaredDebt, useUpdateDeclaredDebt } from "./use-debt-profile";
import { useSaveProtection } from "./use-protection";

const mocks = vi.hoisted(() => ({ POST: vi.fn(), PATCH: vi.fn(), PUT: vi.fn() }));

vi.mock("@/lib/api/client", () => ({ apiClient: mocks }));

const DEBT: DeclaredDebt = {
  id: "11111111-1111-4111-8111-111111111111",
  userId: "user-1",
  name: "Amex revolve",
  kind: "credit_card",
  declaredOutstandingMinor: 85_000_00,
  outstandingMinor: 85_000_00,
  annualRateBps: 4_200,
  minimumPaymentMinor: null,
  linkedAssetId: null,
  linkedAssetName: null,
  amountSource: "declared",
  valuationAsOf: null,
  isEstimate: true,
  isHighCost: true,
  status: "active",
  createdAt: new Date("2026-08-01T00:00:00.000Z"),
  updatedAt: new Date("2026-08-01T00:00:00.000Z"),
  resolvedAt: null
};

const CREATE_INPUT = {
  name: "Amex revolve",
  kind: "credit_card",
  declaredOutstandingMinor: 85_000_00,
  annualRateBps: 4_200,
  minimumPaymentMinor: null,
  linkedAssetId: null
} as const;

function wrapper({ children }: Readonly<{ children: ReactNode }>): ReactNode {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } }
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe("useCreateDeclaredDebt", () => {
  it("sends the idempotency key and keeps it across a failed retry", async () => {
    mocks.POST.mockReset().mockResolvedValue({ error: undefined, data: serialize(DEBT) });
    const { result } = renderHook(() => useCreateDeclaredDebt(), { wrapper });
    const key = result.current.idempotencyKey;

    mocks.POST.mockResolvedValueOnce({
      error: { title: "boom" },
      response: { status: 500 }
    });
    await act(async () => {
      await result.current.mutateAsync(CREATE_INPUT).catch(() => undefined);
    });
    expect(result.current.idempotencyKey).toBe(key);

    await act(async () => {
      await result.current.mutateAsync(CREATE_INPUT);
    });

    expect(mocks.POST).toHaveBeenCalledWith("/v1/financial-profile/debts", {
      body: CREATE_INPUT,
      params: { header: { "Idempotency-Key": key } }
    });
    await waitFor(() => expect(result.current.idempotencyKey).not.toBe(key));
  });
});

describe("useUpdateDeclaredDebt", () => {
  it("sends only the fields being changed", async () => {
    mocks.PATCH.mockReset().mockResolvedValue({
      error: undefined,
      data: serialize({ ...DEBT, status: "resolved" })
    });
    const { result } = renderHook(() => useUpdateDeclaredDebt(), { wrapper });
    const key = result.current.idempotencyKey;

    await act(async () => {
      await result.current.mutateAsync({ debtId: DEBT.id, patch: { status: "resolved" } });
    });

    expect(mocks.PATCH).toHaveBeenCalledWith("/v1/financial-profile/debts/{debtId}", {
      body: { status: "resolved" },
      params: { path: { debtId: DEBT.id }, header: { "Idempotency-Key": key } }
    });
  });

  it("omits absent fields rather than sending them as undefined", async () => {
    mocks.PATCH.mockReset().mockResolvedValue({ error: undefined, data: serialize(DEBT) });
    const { result } = renderHook(() => useUpdateDeclaredDebt(), { wrapper });
    const key = result.current.idempotencyKey;

    await act(async () => {
      await result.current.mutateAsync({ debtId: DEBT.id, patch: { name: "Renamed" } });
    });

    // Exact equality: an extra `status: undefined` key would fail here, and
    // would read to the API as an explicit instruction to change the status.
    expect(mocks.PATCH).toHaveBeenCalledWith("/v1/financial-profile/debts/{debtId}", {
      body: { name: "Renamed" },
      params: { path: { debtId: DEBT.id }, header: { "Idempotency-Key": key } }
    });
  });
});

describe("useSaveProtection", () => {
  it("serializes dates to ISO strings and sends the idempotency key", async () => {
    const snapshot = {
      id: "22222222-2222-4222-8222-222222222222",
      userId: "user-1",
      effectiveFrom: "2026-04-01T00:00:00.000Z",
      termCoverStatus: "independent",
      independentTermCoverMinor: 1_00_00_000,
      employerTermCoverMinor: null,
      independentTermExpiresOn: "2045-04-01T00:00:00.000Z",
      termNotApplicableReason: null,
      healthCoverStatus: "none",
      independentHealthBaseCoverMinor: null,
      independentHealthSuperTopUpMinor: null,
      employerHealthCoverMinor: null,
      independentHealthExpiresOn: null,
      dependantCount: 2,
      createdAt: "2026-04-01T00:00:00.000Z"
    };
    mocks.PUT.mockReset().mockResolvedValue({ error: undefined, data: snapshot });
    const { result } = renderHook(() => useSaveProtection(), { wrapper });
    const key = result.current.idempotencyKey;

    await act(async () => {
      await result.current.mutateAsync({
        effectiveFrom: new Date("2026-04-01T00:00:00.000Z"),
        termCoverStatus: "independent",
        independentTermCoverMinor: 1_00_00_000,
        employerTermCoverMinor: null,
        independentTermExpiresOn: new Date("2045-04-01T00:00:00.000Z"),
        termNotApplicableReason: null,
        healthCoverStatus: "none",
        independentHealthBaseCoverMinor: null,
        independentHealthSuperTopUpMinor: null,
        employerHealthCoverMinor: null,
        independentHealthExpiresOn: null,
        dependantCount: 2
      });
    });

    expect(mocks.PUT).toHaveBeenCalledWith("/v1/financial-profile/protection", {
      body: expect.objectContaining({
        effectiveFrom: "2026-04-01T00:00:00.000Z",
        independentTermExpiresOn: "2045-04-01T00:00:00.000Z",
        independentHealthExpiresOn: null
      }),
      params: { header: { "Idempotency-Key": key } }
    });
  });
});

/** The wire carries ISO strings; the schemas coerce them back into Dates. */
function serialize(debt: DeclaredDebt): Record<string, unknown> {
  return {
    ...debt,
    createdAt: debt.createdAt.toISOString(),
    updatedAt: debt.updatedAt.toISOString(),
    resolvedAt: debt.resolvedAt?.toISOString() ?? null,
    valuationAsOf: debt.valuationAsOf?.toISOString() ?? null
  };
}
