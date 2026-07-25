import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook } from "@testing-library/react";
import type { Goal } from "@treasury-ops/shared";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import { useCreateGoal, useReorderGoals } from "./use-goals";

const mocks = vi.hoisted(() => ({ POST: vi.fn(), PATCH: vi.fn() }));
vi.mock("@/lib/api/client", () => ({ apiClient: mocks }));
vi.mock("@/lib/request-id", () => ({
  generateRequestId: () => "11111111-1111-4111-8111-111111111111"
}));

const response = new Response(null, { status: 200 });
const timestamp = new Date("2026-07-25T00:00:00.000Z");
const goal: Goal = {
  id: "3fa85f64-5717-4562-b3fc-2c963f66beef",
  userId: "user-1",
  name: "Laptop",
  targetMinor: 100_000,
  fundingMode: "tagged",
  tag: "goal:laptop",
  priority: 0,
  status: "active",
  startedMinor: 0,
  progressMinor: 0,
  createdAt: timestamp,
  updatedAt: timestamp
};

function wrapper({ children }: Readonly<{ children: ReactNode }>): ReactNode {
  return (
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      {children}
    </QueryClientProvider>
  );
}

describe("goal mutations", () => {
  it("creates a tagged goal with an idempotency key", async () => {
    mocks.POST.mockResolvedValue({ data: goal, error: undefined, response });
    const hook = renderHook(() => useCreateGoal(), { wrapper });

    await hook.result.current.mutateAsync({
      name: goal.name,
      targetMinor: goal.targetMinor,
      fundingMode: "tagged",
      tag: "goal:laptop"
    });

    expect(mocks.POST).toHaveBeenCalledWith("/v1/goals", {
      body: {
        name: "Laptop",
        targetMinor: 100_000,
        fundingMode: "tagged",
        tag: "goal:laptop"
      },
      params: { header: { "Idempotency-Key": "11111111-1111-4111-8111-111111111111" } }
    });
  });

  it("persists the complete active order", async () => {
    mocks.PATCH.mockResolvedValue({ data: undefined, error: undefined, response });
    const hook = renderHook(() => useReorderGoals(), { wrapper });
    const goalIds = [
      "3fa85f64-5717-4562-b3fc-2c963f66beef",
      "3fa85f64-5717-4562-b3fc-2c963f66beff"
    ];

    await hook.result.current.mutateAsync({ goalIds });

    expect(mocks.PATCH).toHaveBeenCalledWith("/v1/goals/reorder", {
      body: { goalIds },
      params: { header: { "Idempotency-Key": "11111111-1111-4111-8111-111111111111" } }
    });
  });
});
