import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ GET: vi.fn(), getServerApiClient: vi.fn(), api: vi.fn() }));
vi.mock("@/lib/api/server", () => ({ getServerApiClient: mocks.getServerApiClient }));
vi.mock("@/lib/debug", () => ({ debug: { api: mocks.api } }));

const timestamp = "2026-07-16T00:00:00.000Z";
const page = {
  items: [],
  pageInfo: { nextCursor: null, hasMore: false, limit: 20 },
  analysis: {
    status: "ready",
    computedAt: timestamp,
    sourceThrough: timestamp,
    eligibleKinds: [],
    baselineExpenseCount: 10
  }
};

describe("getSpendingWarnings", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.GET.mockReset();
    mocks.getServerApiClient.mockReset();
    mocks.api.mockReset();
    mocks.getServerApiClient.mockResolvedValue({ GET: mocks.GET });
  });

  it("parses a valid response and forwards the mapped kind filter", async () => {
    mocks.GET.mockResolvedValue({ data: page, error: undefined, response: new Response() });
    const { getSpendingWarnings } = await import("./get-spending-warnings");

    const result = await getSpendingWarnings({ filter: "large_expenses" });

    expect(result?.analysis.status).toBe("ready");
    expect(mocks.GET).toHaveBeenCalledWith("/v1/spending-warnings", {
      params: { query: { kind: "unusually_large_expense", limit: 20 } }
    });
  });

  it("returns null when the API responds with an error", async () => {
    mocks.GET.mockResolvedValue({
      data: undefined,
      error: { detail: "down" },
      response: new Response(null, { status: 500 })
    });
    const { getSpendingWarnings } = await import("./get-spending-warnings");

    await expect(getSpendingWarnings({ filter: "all" })).resolves.toBeNull();
    expect(mocks.api).toHaveBeenCalled();
  });

  it("returns null when the response body fails schema validation", async () => {
    mocks.GET.mockResolvedValue({
      data: { items: "invalid" },
      error: undefined,
      response: new Response()
    });
    const { getSpendingWarnings } = await import("./get-spending-warnings");

    await expect(getSpendingWarnings({ filter: "all" })).resolves.toBeNull();
    expect(mocks.api).toHaveBeenCalled();
  });

  it("returns null when the server client rejects", async () => {
    mocks.getServerApiClient.mockRejectedValue(new Error("unavailable"));
    const { getSpendingWarnings } = await import("./get-spending-warnings");

    await expect(getSpendingWarnings({ filter: "all" })).resolves.toBeNull();
    expect(mocks.api).toHaveBeenCalled();
  });
});
