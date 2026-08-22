import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useCategoryRecommendations } from "./use-category-recommendations";

const mocks = vi.hoisted(() => ({ POST: vi.fn() }));
vi.mock("@/lib/api/client", () => ({ apiClient: { POST: mocks.POST } }));

function wrapper({ children }: Readonly<{ children: ReactNode }>): ReactNode {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

const response = new Response(null, { status: 200 });
const payload = {
  items: [],
  computedAt: "2026-08-22T06:30:00.000Z",
  sourceThrough: null,
  algorithmVersion: 2,
  historyRowsConsidered: 0,
  degraded: false
};

describe("useCategoryRecommendations", () => {
  afterEach(() => {
    mocks.POST.mockReset();
  });

  it("does not request while the picker is closed", async () => {
    renderHook(
      () =>
        useCategoryRecommendations({
          enabled: false,
          type: "expense",
          occurredAt: new Date("2026-08-22T06:30:00.000Z")
        }),
      { wrapper }
    );
    await waitFor(() => {
      expect(mocks.POST).not.toHaveBeenCalled();
    });
  });

  it("queries after open and parses the shared envelope", async () => {
    mocks.POST.mockResolvedValue({ data: payload, error: undefined, response });
    const { result } = renderHook(
      () =>
        useCategoryRecommendations({
          enabled: true,
          type: "expense",
          occurredAt: new Date("2026-08-22T06:30:00.000Z")
        }),
      { wrapper }
    );
    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });
    expect(mocks.POST).toHaveBeenCalledWith("/v1/category-recommendations/query", {
      body: {
        type: "expense",
        occurredAt: "2026-08-22T06:30:00.000Z",
        limit: 5
      },
      signal: expect.any(AbortSignal)
    });
  });
});
