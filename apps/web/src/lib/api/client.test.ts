import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ createClient: vi.fn(() => ({ GET: vi.fn() })) }));
vi.mock("openapi-fetch", () => ({ default: mocks.createClient }));

describe("apiClient", () => {
  it("uses the same-origin API proxy", async () => {
    vi.resetModules();
    mocks.createClient.mockClear();
    await import("./client");

    expect(mocks.createClient).toHaveBeenCalledWith({ baseUrl: "/api" });
  });
});
