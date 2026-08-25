import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReserveSource } from "@treasury-ops/shared";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import { useUpdateReserveSource } from "./use-update-reserve-source";

const mocks = vi.hoisted(() => ({ PUT: vi.fn() }));
vi.mock("@/lib/api/client", () => ({ apiClient: mocks }));

const RESULT: ReserveSource = {
  sourceKind: "account",
  sourceId: "11111111-1111-4111-8111-111111111111",
  displayName: "HDFC Savings",
  sourceType: "bank",
  configuration: {
    liquidityTier: "instant",
    isIncluded: true,
    eligibleCapMinor: null,
    effectiveFrom: new Date("2026-08-18T00:00:00.000Z"),
    configuredAt: new Date("2026-08-18T00:00:00.000Z")
  },
  currentValueMinor: 100_000,
  valuedAt: null,
  freshness: "not_applicable",
  eligibleMinor: 100_000,
  eligibility: "eligible",
  exclusionReason: "none",
  isUnavailable: false,
  lastUpdatedAt: new Date("2026-08-18T00:00:00.000Z")
};

function wrapper(client: QueryClient): (props: { children: ReactNode }) => ReactNode {
  function Wrapper({ children }: { children: ReactNode }): ReactNode {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  }
  return Wrapper;
}

describe("useUpdateReserveSource", () => {
  it("sends the path params, Idempotency-Key, and serialized body", async () => {
    mocks.PUT.mockReset().mockResolvedValueOnce({
      data: {
        ...RESULT,
        configuration: {
          ...RESULT.configuration,
          effectiveFrom: RESULT.configuration?.effectiveFrom.toISOString(),
          configuredAt: RESULT.configuration?.configuredAt.toISOString()
        },
        lastUpdatedAt: RESULT.lastUpdatedAt?.toISOString() ?? null
      },
      error: undefined,
      response: { status: 200 }
    });

    const client = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } }
    });
    const { result } = renderHook(() => useUpdateReserveSource(), { wrapper: wrapper(client) });
    const mountedKey = result.current.idempotencyKey;

    await act(async () =>
      result.current.mutateAsync({
        sourceKind: "account",
        sourceId: RESULT.sourceId,
        patch: { liquidityTier: "instant", isIncluded: true }
      })
    );

    expect(mocks.PUT).toHaveBeenCalledWith(
      "/v1/financial-safety/reserve-sources/{sourceKind}/{sourceId}",
      {
        body: { liquidityTier: "instant", isIncluded: true },
        params: {
          path: { sourceKind: "account", sourceId: RESULT.sourceId },
          header: { "Idempotency-Key": mountedKey }
        }
      }
    );
  });

  it("reuses the mounted idempotency key after a failure and rotates it after success", async () => {
    mocks.PUT.mockReset()
      .mockRejectedValueOnce(new TypeError("offline"))
      .mockResolvedValue({ data: RESULT, error: undefined, response: { status: 200 } });

    const client = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } }
    });
    const { result } = renderHook(() => useUpdateReserveSource(), { wrapper: wrapper(client) });
    const mountedKey = result.current.idempotencyKey;

    await expect(
      act(async () =>
        result.current.mutateAsync({
          sourceKind: "account",
          sourceId: RESULT.sourceId,
          patch: { liquidityTier: "instant", isIncluded: true }
        })
      )
    ).rejects.toThrow("offline");
    expect(result.current.idempotencyKey).toBe(mountedKey);

    await act(async () =>
      result.current.mutateAsync({
        sourceKind: "account",
        sourceId: RESULT.sourceId,
        patch: { liquidityTier: "instant", isIncluded: true }
      })
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.idempotencyKey).not.toBe(mountedKey);
  });

  it("invalidates the reserve source, reserve summary, and financial profile query roots on settle", async () => {
    mocks.PUT.mockReset().mockResolvedValue({
      data: RESULT,
      error: undefined,
      response: { status: 200 }
    });

    const client = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } }
    });
    const invalidateSpy = vi.spyOn(client, "invalidateQueries");

    const { result } = renderHook(() => useUpdateReserveSource(), { wrapper: wrapper(client) });

    await act(async () =>
      result.current.mutateAsync({
        sourceKind: "account",
        sourceId: RESULT.sourceId,
        patch: { liquidityTier: "instant", isIncluded: true }
      })
    );

    const invalidatedKeys = invalidateSpy.mock.calls.map((call) => call[0]?.queryKey);
    expect(invalidatedKeys).toContainEqual(["financial-safety"]);
    expect(invalidatedKeys).toContainEqual(["financial-profile"]);
  });
});
