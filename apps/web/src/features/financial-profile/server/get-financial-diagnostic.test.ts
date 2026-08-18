import { beforeEach, describe, expect, it, vi } from "vitest";

import { getFinancialDiagnostic } from "./get-financial-diagnostic";

const mocks = vi.hoisted(() => ({ GET: vi.fn(), getServerApiClient: vi.fn() }));
vi.mock("@/lib/api/server", () => ({
  getServerApiClient: mocks.getServerApiClient
}));

const VALID_DIAGNOSTIC = {
  computedAt: "2026-08-18T10:00:00.000Z",
  sourceThrough: "2026-08-18T10:00:00.000Z",
  formulaVersion: 1,
  policyVersion: 1,
  overallStatus: "setup_required",
  readyCount: 0,
  totalRequiredCount: 4,
  availableCapabilities: [],
  unavailableCapabilities: ["salary_statistics", "life_hour", "essential_burn"],
  nextAction: "configure_salary",
  items: [
    {
      key: "salary",
      status: "missing",
      attention: "blocking",
      source: "financial_profile",
      lastUpdatedAt: null,
      requiredFor: ["salary_statistics"],
      action: "configure_salary",
      evidence: {
        observedCount: null,
        requiredCount: null,
        completeMonthCount: null,
        activeCount: 0,
        estimatedCount: null,
        staleCount: null,
        highCostDebtCount: null,
        missingValuationCount: null,
        latestObservedAt: null,
        oldestRelevantAt: null,
        freshnessThresholdDays: null
      },
      summaryKey: "salary.missing",
      limitationKeys: ["salary.not_configured"]
    }
  ],
  limitations: ["salary.not_configured"]
};

describe("getFinancialDiagnostic server fetcher", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getServerApiClient.mockResolvedValue({ GET: mocks.GET });
  });

  it("parses valid diagnostic data correctly", async () => {
    mocks.GET.mockResolvedValueOnce({ data: VALID_DIAGNOSTIC });

    const result = await getFinancialDiagnostic();

    expect(result).not.toBeNull();
    expect(result?.overallStatus).toBe("setup_required");
    expect(result?.nextAction).toBe("configure_salary");
    expect(result?.items.length).toBe(1);
    expect(mocks.GET).toHaveBeenCalledWith("/v1/financial-profile/diagnostic", {
      params: { query: {} }
    });
  });

  it("passes asOf query when specified", async () => {
    mocks.GET.mockResolvedValueOnce({ data: VALID_DIAGNOSTIC });

    const asOfStr = "2026-08-16T00:00:00.000Z";
    await getFinancialDiagnostic(asOfStr);

    expect(mocks.GET).toHaveBeenCalledWith("/v1/financial-profile/diagnostic", {
      params: { query: { asOf: asOfStr } }
    });
  });

  it("fails closed to null on schema validation failure", async () => {
    mocks.GET.mockResolvedValueOnce({ data: { corrupted: true } });

    const result = await getFinancialDiagnostic();
    expect(result).toBeNull();
  });

  it("fails closed to null on network error", async () => {
    mocks.GET.mockRejectedValueOnce(new Error("Network connection refused"));

    const result = await getFinancialDiagnostic();
    expect(result).toBeNull();
  });
});
