import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { UserProfile } from "@treasury-ops/shared";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import { useProfile, useUpdateProfile } from "./use-profile";

const mocks = vi.hoisted(() => ({
  GET: vi.fn(),
  PATCH: vi.fn()
}));

vi.mock("@/lib/api/client", () => ({
  apiClient: mocks
}));

const sampleProfile: UserProfile = {
  userId: "user-1",
  displayName: "Harsh",
  locale: "en-IN",
  timezone: "Asia/Kolkata",
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-01T00:00:00.000Z")
};

function wrapper(): (props: { children: ReactNode }) => ReactNode {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  function Wrapper({ children }: { children: ReactNode }): ReactNode {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  }
  return Wrapper;
}

describe("useProfile", () => {
  it("seeds from initialData without waiting on a fetch", () => {
    const { result } = renderHook(() => useProfile(sampleProfile), { wrapper: wrapper() });

    expect(result.current.data).toEqual(sampleProfile);
  });

  it("refetches and returns the parsed profile", async () => {
    mocks.GET.mockResolvedValue({
      data: { ...sampleProfile, displayName: "Refetched" },
      error: undefined,
      response: { status: 200 }
    });

    const { result } = renderHook(() => useProfile(null), { wrapper: wrapper() });

    await waitFor(() => expect(result.current.data?.displayName).toBe("Refetched"));
    expect(mocks.GET).toHaveBeenCalledWith("/v1/profile");
  });
});

describe("useUpdateProfile", () => {
  it("patches the profile without an Idempotency-Key header and returns the parsed result", async () => {
    mocks.PATCH.mockResolvedValue({
      data: { ...sampleProfile, displayName: "New Name" },
      error: undefined,
      response: { status: 200 }
    });

    const { result } = renderHook(() => useUpdateProfile(), { wrapper: wrapper() });
    result.current.mutate({ displayName: "New Name" });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.displayName).toBe("New Name");
    expect(mocks.PATCH).toHaveBeenCalledWith("/v1/profile", {
      body: { displayName: "New Name" }
    });
  });
});
