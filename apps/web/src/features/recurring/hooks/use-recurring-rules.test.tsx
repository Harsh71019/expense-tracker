import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { RecurringRule } from "@treasury-ops/shared";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import {
  useCreateRecurringRule,
  useRecurringRules,
  useUpdateRecurringRule
} from "./use-recurring-rules";

const mocks = vi.hoisted(() => ({ GET: vi.fn(), POST: vi.fn(), PATCH: vi.fn() }));
vi.mock("@/lib/api/client", () => ({ apiClient: mocks }));
vi.mock("@/lib/request-id", () => ({
  generateRequestId: () => "11111111-1111-4111-8111-111111111111"
}));

const wrapper = ({ children }: Readonly<{ children: ReactNode }>): ReactNode => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    {children}
  </QueryClientProvider>
);

const response = new Response(null, { status: 200 });
const timestamp = new Date("2026-07-19T00:00:00.000Z");
const rule: RecurringRule = {
  id: "3fa85f64-5717-4562-b3fc-2c963f66bef0",
  userId: "user-1",
  template: {
    accountId: "3fa85f64-5717-4562-b3fc-2c963f66beef",
    type: "expense",
    amountMinor: 50_000,
    description: "Internet",
    tags: []
  },
  rrule: "FREQ=MONTHLY;BYMONTHDAY=1",
  startAt: timestamp,
  nextRunAt: timestamp,
  isPaused: false,
  createdAt: timestamp,
  updatedAt: timestamp
};

describe("recurring rule hooks", () => {
  it("loads and validates recurring rules", async () => {
    mocks.GET.mockResolvedValue({ data: [rule], error: undefined, response });
    const hook = renderHook(() => useRecurringRules([]), { wrapper });
    await waitFor(() =>
      expect(hook.result.current.data?.[0]?.template.description).toBe("Internet")
    );
  });

  it("creates a rule with an ISO date and idempotency key", async () => {
    mocks.POST.mockResolvedValue({ data: rule, error: undefined, response });
    const hook = renderHook(() => useCreateRecurringRule(), { wrapper });
    await hook.result.current.mutateAsync({
      template: rule.template,
      rrule: rule.rrule,
      startAt: timestamp
    });
    expect(mocks.POST).toHaveBeenCalledWith("/v1/recurring", {
      body: {
        template: rule.template,
        rrule: rule.rrule,
        startAt: "2026-07-19T00:00:00.000Z"
      },
      params: { header: { "Idempotency-Key": "11111111-1111-4111-8111-111111111111" } }
    });
  });

  it("updates pause state through the typed endpoint", async () => {
    mocks.PATCH.mockResolvedValue({
      data: { ...rule, isPaused: true },
      error: undefined,
      response
    });
    const hook = renderHook(() => useUpdateRecurringRule(), { wrapper });
    await hook.result.current.mutateAsync({ ruleId: rule.id, patch: { isPaused: true } });
    expect(mocks.PATCH).toHaveBeenCalledWith("/v1/recurring/{ruleId}", {
      body: { isPaused: true },
      params: {
        path: { ruleId: rule.id },
        header: { "Idempotency-Key": "11111111-1111-4111-8111-111111111111" }
      }
    });
  });

  it("rejects malformed list responses", async () => {
    mocks.GET.mockResolvedValue({ data: [{ id: "invalid" }], error: undefined, response });
    const hook = renderHook(() => useRecurringRules([]), { wrapper });
    await waitFor(() => expect(hook.result.current.isError).toBe(true));
  });
});
