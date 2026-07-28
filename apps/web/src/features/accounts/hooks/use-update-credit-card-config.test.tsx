import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook } from "@testing-library/react";
import { AccountSchema } from "@treasury-ops/shared";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import { useUpdateCreditCardConfig } from "./use-update-credit-card-config";

const mocks = vi.hoisted(() => ({ PATCH: vi.fn() }));
vi.mock("@/lib/api/client", () => ({ apiClient: mocks }));

const response = new Response(null, { status: 200 });
const account = AccountSchema.parse({
  id: "3fa85f64-5717-4562-b3fc-2c963f66be02",
  userId: "user-1",
  name: "HDFC Card",
  type: "credit_card",
  currency: "INR",
  openingBalanceMinor: 0,
  balanceMinor: -10_000,
  creditCardConfig: {
    statementDay: 25,
    dueDay: 15,
    nextStatementAt: new Date("2026-08-25T00:00:00.000Z")
  },
  isArchived: false,
  createdAt: new Date("2026-07-25T00:00:00.000Z"),
  updatedAt: new Date("2026-07-25T00:00:00.000Z")
});

function wrapper({ children }: Readonly<{ children: ReactNode }>): ReactNode {
  return (
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      {children}
    </QueryClientProvider>
  );
}

describe("useUpdateCreditCardConfig", () => {
  it("uses the generated endpoint and parses its account response", async () => {
    mocks.PATCH.mockResolvedValue({ data: account, response });
    const hook = renderHook(() => useUpdateCreditCardConfig(), { wrapper });
    await expect(
      hook.result.current.mutateAsync({
        accountId: account.id,
        config: { statementDay: 25, dueDay: 15 }
      })
    ).resolves.toMatchObject({ id: account.id });
    expect(mocks.PATCH).toHaveBeenCalledWith("/v1/accounts/{accountId}/credit-card-config", {
      params: {
        path: { accountId: account.id },
        header: { "Idempotency-Key": expect.any(String) }
      },
      body: { statementDay: 25, dueDay: 15 }
    });
  });
});
