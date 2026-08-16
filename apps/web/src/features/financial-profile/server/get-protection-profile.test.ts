import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ GET: vi.fn(), getServerApiClient: vi.fn() }));
vi.mock("@/lib/api/server", () => ({ getServerApiClient: mocks.getServerApiClient }));

const NOT_CONFIGURED = {
  configured: false,
  currentSnapshot: null,
  upcomingSnapshot: null,
  asOf: "2026-08-16T00:00:00.000Z",
  dataQuality: "unavailable",
  termCover: {
    state: "not_configured",
    expiryState: "not_applicable",
    expiresOn: null,
    hasIndependentCover: false,
    hasEmployerCover: false
  },
  healthCover: {
    state: "not_configured",
    expiryState: "not_applicable",
    expiresOn: null,
    hasIndependentCover: false,
    hasEmployerCover: false
  },
  expiringSoonDays: 90,
  limitations: []
};

const DEBT_PAGE = {
  items: [
    {
      id: "11111111-1111-4111-8111-111111111111",
      userId: "user-1",
      name: "Amex revolve",
      kind: "credit_card",
      declaredOutstandingMinor: 85_000_00,
      outstandingMinor: 85_000_00,
      annualRateBps: 4_200,
      minimumPaymentMinor: null,
      linkedAssetId: null,
      linkedAssetName: null,
      amountSource: "declared",
      valuationAsOf: null,
      isEstimate: true,
      isHighCost: true,
      status: "active",
      createdAt: "2026-08-01T00:00:00.000Z",
      updatedAt: "2026-08-01T00:00:00.000Z",
      resolvedAt: null
    }
  ],
  pageInfo: { nextCursor: null, hasMore: false, limit: 50 },
  highCost: { thresholdBps: 1_200, comparison: "greater_than", highCostCount: 1 }
};

describe("protection server loaders", () => {
  beforeEach(async () => {
    vi.resetModules();
    mocks.GET.mockReset();
    mocks.getServerApiClient.mockReset().mockResolvedValue({ GET: mocks.GET });
  });

  it("parses the protection state for the initial render", async () => {
    mocks.GET.mockResolvedValue({ data: NOT_CONFIGURED });
    const { getProtectionState } = await import("./get-protection-profile");

    const state = await getProtectionState();

    expect(mocks.GET).toHaveBeenCalledWith("/v1/financial-profile/protection");
    expect(state).toMatchObject({ configured: false, dataQuality: "unavailable" });
    expect(state?.asOf).toBeInstanceOf(Date);
  });

  it("fails closed to null on a schema mismatch rather than trusting the payload", async () => {
    mocks.GET.mockResolvedValue({ data: { configured: true } });
    const { getProtectionState } = await import("./get-protection-profile");

    expect(await getProtectionState()).toBeNull();
  });

  it("fails closed to null when the request throws", async () => {
    mocks.GET.mockRejectedValue(new Error("network"));
    const { getProtectionState } = await import("./get-protection-profile");

    expect(await getProtectionState()).toBeNull();
  });

  it("requests only active debts for the initial render", async () => {
    mocks.GET.mockResolvedValue({ data: DEBT_PAGE });
    const { getDeclaredDebtPage, DEBT_PAGE_SIZE } = await import("./get-protection-profile");

    const page = await getDeclaredDebtPage();

    expect(mocks.GET).toHaveBeenCalledWith("/v1/financial-profile/debts", {
      params: { query: { limit: DEBT_PAGE_SIZE, status: "active" } }
    });
    expect(page?.items).toHaveLength(1);
    expect(page?.highCost.thresholdBps).toBe(1_200);
  });

  it("honours an explicit debt page size", async () => {
    mocks.GET.mockResolvedValue({ data: DEBT_PAGE });
    const { getDeclaredDebtPage } = await import("./get-protection-profile");

    await getDeclaredDebtPage(10);

    expect(mocks.GET).toHaveBeenCalledWith("/v1/financial-profile/debts", {
      params: { query: { limit: 10, status: "active" } }
    });
  });

  it("fails closed to null for an unparseable debt page", async () => {
    mocks.GET.mockResolvedValue({ data: { items: [{ id: "nope" }] } });
    const { getDeclaredDebtPage } = await import("./get-protection-profile");

    expect(await getDeclaredDebtPage()).toBeNull();
  });

  it("fails closed to null when the debt request throws", async () => {
    mocks.GET.mockRejectedValue(new Error("network"));
    const { getDeclaredDebtPage } = await import("./get-protection-profile");

    expect(await getDeclaredDebtPage()).toBeNull();
  });
});
