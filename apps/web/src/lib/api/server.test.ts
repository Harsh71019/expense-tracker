import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(() => ({ GET: vi.fn() })),
  cookies: vi.fn(),
  requestId: vi.fn(() => "request-1")
}));
vi.mock("openapi-fetch", () => ({ default: mocks.createClient }));
vi.mock("next/headers", () => ({ cookies: mocks.cookies }));
vi.mock("../request-id", () => ({ generateRequestId: mocks.requestId }));

describe("getServerApiClient", () => {
  it("forwards the request cookie and a tracing id to the internal API", async () => {
    vi.resetModules();
    mocks.createClient.mockClear();
    mocks.cookies.mockResolvedValue({ toString: () => "vyaya.session=abc" });
    const { getServerApiClient } = await import("./server");

    await getServerApiClient();

    expect(mocks.createClient).toHaveBeenCalledWith({
      baseUrl: "http://localhost:3000/api",
      headers: { cookie: "vyaya.session=abc", "x-request-id": "request-1" }
    });
  });
});
