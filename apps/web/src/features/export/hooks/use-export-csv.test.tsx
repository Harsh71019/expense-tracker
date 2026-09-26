import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import { useExportCsv } from "./use-export-csv";

const mocks = vi.hoisted(() => ({ GET: vi.fn() }));

vi.mock("@/lib/api/client", () => ({ apiClient: mocks }));

function wrapper({ children }: Readonly<{ children: ReactNode }>): ReactNode {
  return <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>;
}

describe("useExportCsv", () => {
  it("sends every active transaction filter to the export endpoint", async () => {
    mocks.GET.mockResolvedValue({
      data: "Date,Amount\r\n",
      error: undefined,
      response: new Response(null, { status: 200 })
    });
    const hook = renderHook(() => useExportCsv(), { wrapper });

    await act(async () => {
      await hook.result.current.mutateAsync({
        accountId: "3fa85f64-5717-4562-b3fc-2c963f66beff",
        uncategorized: true,
        from: new Date("2026-08-01T00:00:00.000Z"),
        to: new Date("2026-08-31T23:59:59.999Z"),
        minAmountMinor: 5_000,
        maxAmountMinor: 20_000,
        sort: "amount_desc",
        q: "rent",
        tag: "home"
      });
    });

    expect(mocks.GET).toHaveBeenCalledWith("/v1/export/csv", {
      params: {
        query: {
          accountId: "3fa85f64-5717-4562-b3fc-2c963f66beff",
          uncategorized: "true",
          from: "2026-08-01T00:00:00.000Z",
          to: "2026-08-31T23:59:59.999Z",
          minAmountMinor: 5_000,
          maxAmountMinor: 20_000,
          sort: "amount_desc",
          q: "rent",
          tag: "home"
        }
      }
    });
  });
});
