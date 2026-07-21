import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ApiKey } from "@vyaya/shared";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import { useCreateApiKey, useRevokeApiKey, useUpdateApiKey } from "./use-api-keys";

const mocks = vi.hoisted(() => ({
  POST: vi.fn(),
  PATCH: vi.fn(),
  DELETE: vi.fn()
}));

vi.mock("@/lib/api/client", () => ({
  apiClient: mocks
}));

const sampleKey: ApiKey = {
  id: "key-1",
  name: "n8n",
  start: "ak_ab",
  permissions: { transactions: ["write"] },
  enabled: true,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  expiresAt: null,
  lastRequest: null
};

function wrapper(): (props: { children: ReactNode }) => ReactNode {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  function Wrapper({ children }: { children: ReactNode }): ReactNode {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  }
  return Wrapper;
}

describe("useCreateApiKey", () => {
  it("posts the create body and returns the parsed response", async () => {
    mocks.POST.mockResolvedValue({
      data: { ...sampleKey, key: "ak_secret" },
      error: undefined,
      response: { status: 201 }
    });

    const { result } = renderHook(() => useCreateApiKey(), { wrapper: wrapper() });
    result.current.mutate({ name: "n8n", permissions: { transactions: ["write"] } });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toMatchObject({ id: "key-1", key: "ak_secret" });
    expect(mocks.POST).toHaveBeenCalledWith("/v1/api-keys", {
      body: { name: "n8n", permissions: { transactions: ["write"] } }
    });
  });
});

describe("useUpdateApiKey", () => {
  it("patches by keyId and returns the parsed key", async () => {
    mocks.PATCH.mockResolvedValue({
      data: { ...sampleKey, name: "renamed" },
      error: undefined,
      response: { status: 200 }
    });

    const { result } = renderHook(() => useUpdateApiKey(), { wrapper: wrapper() });
    result.current.mutate({ keyId: "key-1", input: { name: "renamed" } });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.name).toBe("renamed");
    expect(mocks.PATCH).toHaveBeenCalledWith("/v1/api-keys/{keyId}", {
      params: { path: { keyId: "key-1" } },
      body: { name: "renamed" }
    });
  });
});

describe("useRevokeApiKey", () => {
  it("deletes by keyId", async () => {
    mocks.DELETE.mockResolvedValue({
      data: undefined,
      error: undefined,
      response: { status: 204 }
    });

    const { result } = renderHook(() => useRevokeApiKey(), { wrapper: wrapper() });
    result.current.mutate("key-1");

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mocks.DELETE).toHaveBeenCalledWith("/v1/api-keys/{keyId}", {
      params: { path: { keyId: "key-1" } }
    });
  });
});
