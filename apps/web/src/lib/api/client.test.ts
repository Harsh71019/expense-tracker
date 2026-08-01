import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  use: vi.fn(),
  createClient: vi.fn(() => ({ GET: vi.fn(), use: mocks.use }))
}));
vi.mock("openapi-fetch", () => ({ default: mocks.createClient }));

describe("apiClient", () => {
  it("uses the same-origin API proxy", async () => {
    vi.resetModules();
    mocks.createClient.mockClear();
    await import("./client");

    expect(mocks.createClient).toHaveBeenCalledWith({ baseUrl: "/api" });
    expect(mocks.use).toHaveBeenCalledWith({ onError: expect.any(Function) });
  });
});
