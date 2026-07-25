import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { RecurringForecast } from "@treasury-ops/shared";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useRecurringForecast } from "./use-recurring-forecast";

const mocks = vi.hoisted(() => ({ GET: vi.fn() }));
vi.mock("@/lib/api/client", () => ({ apiClient: mocks }));

const wrapper = ({ children }: Readonly<{ children: ReactNode }>): ReactNode => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    {children}
  </QueryClientProvider>
);
const response = new Response(null, { status: 200 });
const forecast: RecurringForecast = {
  range: "1M",
  inMinor: 500,
  outMinor: 300,
  netMinor: 200,
  upcoming: []
};

describe("useRecurringForecast", () => {
  beforeEach(() => {
    mocks.GET.mockReset();
  });

  it("loads and parses the recurring forecast for the given range", async () => {
    mocks.GET.mockResolvedValue({ data: forecast, error: undefined, response });
    const hook = renderHook(() => useRecurringForecast("1M"), { wrapper });

    await waitFor(() => expect(hook.result.current.data?.netMinor).toBe(200));
    expect(mocks.GET).toHaveBeenCalledWith(
      "/v1/dashboard/recurring-forecast",
      expect.objectContaining({ params: { query: { range: "1M" } } })
    );
  });

  it("rejects malformed payloads", async () => {
    mocks.GET.mockResolvedValue({ data: { range: "1M" }, error: undefined, response });
    const hook = renderHook(() => useRecurringForecast("1M"), { wrapper });

    await waitFor(() => expect(hook.result.current.isError).toBe(true));
    expect(hook.result.current.error?.message).toBe("The request could not be completed.");
  });

  it("hydrates from initial data without refetching immediately", () => {
    const hook = renderHook(() => useRecurringForecast("1M", forecast), { wrapper });
    expect(hook.result.current.data).toEqual(forecast);
  });
});
