import { beforeEach, describe, expect, it, vi } from "vitest";

import { getEssentialBurn } from "./get-essential-burn";

const mocks = vi.hoisted(() => ({ GET: vi.fn(), getServerApiClient: vi.fn() }));
vi.mock("@/lib/api/server", () => ({
  getServerApiClient: mocks.getServerApiClient
}));

const VALID_ESSENTIAL_BURN = {
  computedAt: "2026-08-18T10:00:00.000Z",
  asOf: "2026-08-18T10:00:00.000Z",
  sourceThrough: "2026-08-18T10:00:00.000Z",
  formulaVersion: 1,
  timezone: "Asia/Kolkata",
  requiredCompleteMonths: 3,
  observedCompleteMonthCount: 3,
  averageMonthlyEssentialMinor: 50_000,
  quality: "complete",
  completeMonths: [
    {
      month: "2026-05",
      observation: "observed",
      essentialTotalMinor: 50_000,
      eligibleExpenseTransactionCount: 5,
      essentialTransactionCount: 3
    },
    {
      month: "2026-06",
      observation: "observed",
      essentialTotalMinor: 50_000,
      eligibleExpenseTransactionCount: 5,
      essentialTransactionCount: 3
    },
    {
      month: "2026-07",
      observation: "observed",
      essentialTotalMinor: 50_000,
      eligibleExpenseTransactionCount: 5,
      essentialTransactionCount: 3
    }
  ],
  currentPartialMonth: {
    month: "2026-08",
    essentialTotalMinor: 20_000,
    eligibleExpenseTransactionCount: 2,
    essentialTransactionCount: 1,
    excludedFromBaseline: true
  },
  classification: {
    eligibleExpenseTransactionCount: 15,
    essentialExpenseTransactionCount: 9,
    lifestyleExpenseTransactionCount: 6,
    uncategorizedExpenseCount: 0,
    uncategorizedExpenseMinor: 0,
    ungroupedExpenseCount: 0,
    ungroupedExpenseMinor: 0,
    categorizedExpenseMinor: 150_000,
    unclassifiedExpenseMinor: 0,
    coverageRatioBps: 10000,
    currentCategoryMetadataInUse: true
  },
  limitations: ["current_category_metadata_in_use"]
};

describe("getEssentialBurn server fetcher", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getServerApiClient.mockResolvedValue({ GET: mocks.GET });
  });

  it("parses valid essential burn data correctly", async () => {
    mocks.GET.mockResolvedValueOnce({ data: VALID_ESSENTIAL_BURN });

    const result = await getEssentialBurn();

    expect(result).not.toBeNull();
    expect(result?.quality).toBe("complete");
    expect(result?.averageMonthlyEssentialMinor).toBe(50_000);
    expect(result?.completeMonths.length).toBe(3);
    expect(mocks.GET).toHaveBeenCalledWith("/v1/financial-safety/essential-burn", {
      params: { query: {} }
    });
  });

  it("passes asOf query when specified", async () => {
    mocks.GET.mockResolvedValueOnce({ data: VALID_ESSENTIAL_BURN });

    const asOfStr = "2026-08-16T00:00:00.000Z";
    await getEssentialBurn(asOfStr);

    expect(mocks.GET).toHaveBeenCalledWith("/v1/financial-safety/essential-burn", {
      params: { query: { asOf: asOfStr } }
    });
  });

  it("fails closed to null on schema validation failure", async () => {
    mocks.GET.mockResolvedValueOnce({ data: { corrupted: true } });

    const result = await getEssentialBurn();
    expect(result).toBeNull();
  });

  it("fails closed to null on network error", async () => {
    mocks.GET.mockRejectedValueOnce(new Error("Network connection refused"));

    const result = await getEssentialBurn();
    expect(result).toBeNull();
  });
});
