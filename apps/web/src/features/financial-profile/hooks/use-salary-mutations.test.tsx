import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { FinancialProfile, SalaryVersion } from "@treasury-ops/shared";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import { ConflictError } from "@/lib/errors";

import { useCreateSalaryVersion, useUpdateFinancialProfile } from "./use-salary-mutations";

const mocks = vi.hoisted(() => ({
  PATCH: vi.fn(),
  POST: vi.fn()
}));

vi.mock("@/lib/api/client", () => ({ apiClient: mocks }));

const PROFILE: FinancialProfile = {
  userId: "user-1",
  monthlyWorkMinutes: 9_600,
  salaryCreditDay: 1,
  expectedAnnualIncrementBps: null,
  incomeStability: "stable",
  createdAt: new Date("2026-04-01T00:00:00.000Z"),
  updatedAt: new Date("2026-04-01T00:00:00.000Z")
};

const VERSION: SalaryVersion = {
  id: "3fa85f64-5717-4562-b3fc-2c963f66be00",
  userId: "user-1",
  netMonthlySalaryMinor: 12_50_000,
  annualCtcMinor: null,
  effectiveFrom: new Date("2026-04-01T00:00:00.000Z"),
  source: "manually_confirmed",
  createdAt: new Date("2026-04-01T00:00:00.000Z")
};

const PROFILE_INPUT = {
  monthlyWorkMinutes: 9_600,
  incomeStability: "stable",
  salaryCreditDay: 1,
  expectedAnnualIncrementBps: null
} as const;

const SALARY_INPUT = {
  netMonthlySalaryMinor: 12_50_000,
  annualCtcMinor: null,
  effectiveFrom: new Date("2026-04-01T00:00:00.000Z")
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

describe("useCreateSalaryVersion", () => {
  it("reuses its mounted idempotency key after a failure and rotates it after success", async () => {
    mocks.POST.mockReset()
      .mockRejectedValueOnce(new TypeError("offline"))
      .mockResolvedValue({ data: VERSION, error: undefined, response: { status: 201 } });
    const { result } = renderHook(() => useCreateSalaryVersion(), { wrapper: wrapper() });
    const mountedKey = result.current.idempotencyKey;

    await expect(act(async () => result.current.mutateAsync(SALARY_INPUT))).rejects.toThrow(
      "offline"
    );
    expect(result.current.idempotencyKey).toBe(mountedKey);

    await act(async () => result.current.mutateAsync(SALARY_INPUT));
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const firstKey = mocks.POST.mock.calls[0]?.[1].params.header["Idempotency-Key"];
    const retryKey = mocks.POST.mock.calls[1]?.[1].params.header["Idempotency-Key"];
    expect(retryKey).toBe(firstKey);
    expect(firstKey).toBe(mountedKey);

    await act(async () => result.current.mutateAsync(SALARY_INPUT));
    expect(mocks.POST.mock.calls[2]?.[1].params.header["Idempotency-Key"]).not.toBe(retryKey);
  });

  it("serializes the effective date as an ISO instant", async () => {
    mocks.POST.mockReset().mockResolvedValue({
      data: VERSION,
      error: undefined,
      response: { status: 201 }
    });
    const { result } = renderHook(() => useCreateSalaryVersion(), { wrapper: wrapper() });

    await act(async () => result.current.mutateAsync(SALARY_INPUT));

    expect(mocks.POST.mock.calls[0]?.[0]).toBe("/v1/financial-profile/salary-versions");
    expect(mocks.POST.mock.calls[0]?.[1].body).toEqual({
      netMonthlySalaryMinor: 12_50_000,
      annualCtcMinor: null,
      effectiveFrom: "2026-04-01T00:00:00.000Z"
    });
  });

  it("surfaces a duplicate effective date as a conflict the form can attach to a field", async () => {
    mocks.POST.mockReset().mockResolvedValue({
      data: undefined,
      error: {
        type: "https://treasury-ops.app/problems/financial_profile.duplicate_effective_date",
        title: "DuplicateSalaryEffectiveDateError",
        status: 409,
        detail: "A salary version already exists for this effective date. Pick a different date.",
        message: "A salary version already exists for this effective date. Pick a different date.",
        instance: "/api/v1/financial-profile/salary-versions",
        code: "financial_profile.duplicate_effective_date",
        reqId: "req-1",
        timestamp: "2026-08-16T00:00:00.000Z",
        retryable: false,
        errors: null
      },
      response: { status: 409 }
    });
    const { result } = renderHook(() => useCreateSalaryVersion(), { wrapper: wrapper() });

    await expect(act(async () => result.current.mutateAsync(SALARY_INPUT))).rejects.toBeInstanceOf(
      ConflictError
    );
  });
});

describe("useUpdateFinancialProfile", () => {
  it("sends the canonical body with a mounted idempotency key", async () => {
    mocks.PATCH.mockReset().mockResolvedValue({
      data: PROFILE,
      error: undefined,
      response: { status: 200 }
    });
    const { result } = renderHook(() => useUpdateFinancialProfile(), { wrapper: wrapper() });
    const mountedKey = result.current.idempotencyKey;

    await act(async () => result.current.mutateAsync(PROFILE_INPUT));
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(mocks.PATCH.mock.calls[0]?.[0]).toBe("/v1/financial-profile");
    expect(mocks.PATCH.mock.calls[0]?.[1].body).toEqual(PROFILE_INPUT);
    expect(mocks.PATCH.mock.calls[0]?.[1].params.header["Idempotency-Key"]).toBe(mountedKey);
  });

  it("fails closed when the response does not match the shared schema", async () => {
    mocks.PATCH.mockReset().mockResolvedValue({
      data: { monthlyWorkMinutes: "lots" },
      error: undefined,
      response: { status: 200 }
    });
    const { result } = renderHook(() => useUpdateFinancialProfile(), { wrapper: wrapper() });

    await expect(act(async () => result.current.mutateAsync(PROFILE_INPUT))).rejects.toBeTruthy();
  });
});
