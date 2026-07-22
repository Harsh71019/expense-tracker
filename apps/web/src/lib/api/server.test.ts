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
    mocks.cookies.mockResolvedValue({ toString: () => "treasury-ops.session=abc" });
    const { getServerApiClient } = await import("./server");

    await getServerApiClient();

    expect(mocks.createClient).toHaveBeenCalledWith({
      baseUrl: "http://localhost:3000/api",
      headers: { cookie: "treasury-ops.session=abc", "x-request-id": "request-1" },
      fetch: expect.any(Function)
    });
  });

  it("disables Next.js caching for mutable API reads", async () => {
    vi.resetModules();
    const response = new Response(null, { status: 204 });
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(response);
    const { noStoreFetch } = await import("./server");
    const request = new Request("http://localhost:4000/api/v1/accounts");

    await expect(noStoreFetch(request)).resolves.toBe(response);
    expect(fetchMock).toHaveBeenCalledWith(request, { cache: "no-store" });
    fetchMock.mockRestore();
  });
});
