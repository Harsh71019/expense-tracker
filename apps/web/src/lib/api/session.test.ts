import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  cookie: "vyaya.session=test-cookie",
  api: vi.fn()
}));

vi.mock("next/headers", () => ({
  cookies: async () => ({ toString: () => mocks.cookie })
}));

vi.mock("../debug", () => ({
  debug: { api: mocks.api }
}));

async function loadGetSession(): Promise<() => Promise<unknown>> {
  vi.resetModules();
  const sessionModule = await import("./session");
  return sessionModule.getSession;
}

describe("getSession", () => {
  beforeEach(() => {
    mocks.api.mockReset();
    vi.stubGlobal("fetch", vi.fn());
  });

  it("forwards cookies and returns a zod-validated session", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ user: { id: "user-1", email: "harsh@example.com" } }), {
        status: 200
      })
    );

    const getSession = await loadGetSession();

    await expect(getSession()).resolves.toEqual({
      user: { id: "user-1", email: "harsh@example.com" }
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:3000/api/auth/get-session",
      expect.objectContaining({ headers: expect.objectContaining({ cookie: mocks.cookie }) })
    );
  });

  it("fails closed when the API rejects the request or returns an invalid payload", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 401 }));
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ user: { id: "user-1" } }), { status: 200 })
    );

    const getRejectedSession = await loadGetSession();
    await expect(getRejectedSession()).resolves.toBeNull();

    const getInvalidSession = await loadGetSession();
    await expect(getInvalidSession()).resolves.toBeNull();
  });

  it("fails closed when the API is unreachable", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockRejectedValue(new TypeError("Network unavailable"));

    const getSession = await loadGetSession();
    await expect(getSession()).resolves.toBeNull();
  });

  it("fails closed when a successful response is not JSON", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValue(new Response("upstream error page", { status: 200 }));

    const getSession = await loadGetSession();
    await expect(getSession()).resolves.toBeNull();
  });
});
