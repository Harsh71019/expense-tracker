import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ GET: vi.fn(), getServerApiClient: vi.fn() }));
vi.mock("@/lib/api/server", () => ({ getServerApiClient: mocks.getServerApiClient }));

const validSnapshot = {
  id: "3fa85f64-5717-4562-b3fc-2c963f66beef",
  asOf: "2026-08-16T00:00:00.000Z",
  horizonDays: 30,
  modelVersion: 1,
  inputWatermark: {
    asOf: "2026-08-16T00:00:00.000Z",
    latestOccurredAt: "2026-08-15T00:00:00.000Z",
    latestUpdatedAt: "2026-08-15T00:00:00.000Z",
    rowCount: 60,
    digest: "a".repeat(64)
  },
  sufficiency: { status: "sufficient", observationCount: 60, minimumRequired: 35 },
  resources: {
    rowsScanned: 60,
    runtimeMs: 3,
    rowBudgetHit: false,
    timedOut: false,
    outcome: { status: "completed" }
  },
  model: "trailing_median",
  pointBalanceMinor: 12_500,
  range: {
    lowerMinor: 8_000,
    upperMinor: 15_000,
    observedCoverageBps: 8_500,
    label: "historical_range"
  },
  assumptions: {
    liquidBalanceMinor: 10_000,
    knownRecurringInflowMinor: 8_000,
    knownRecurringOutflowMinor: 3_000,
    creditCardBillsDueMinor: 1_500,
    excludedCreditCardPurchaseCount: 1,
    excludedTransferCount: 1,
    variableSpendExcludedRecurringCount: 2,
    asOfDeterministic: true
  },
  metrics: {
    evaluatedOriginCount: 8,
    maeMinor: 500,
    maseBps: null,
    baselineMaeMinor: null,
    residualCount: 8,
    observedCoverageBps: 8_500,
    eligibleForHorizon: true
  },
  shortfall: {
    hasPotentialShortfall: false,
    firstPotentialShortfallDate: null,
    conservativeBalanceMinor: 8_000,
    mode: "read_only"
  },
  computedAt: "2026-08-16T01:00:00.000Z"
};

describe("getCashflowForecasts", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.GET.mockReset();
    mocks.getServerApiClient.mockReset();
    mocks.getServerApiClient.mockResolvedValue({ GET: mocks.GET });
  });

  it("returns null forecasts when snapshots are not ready yet", async () => {
    mocks.GET.mockResolvedValue({ data: null, response: { status: 200 } });
    const { getCashflowForecasts } = await import("./get-cashflow-forecasts");

    const forecasts = await getCashflowForecasts();
    expect(forecasts).toEqual({
      thirtyDay: null,
      sixtyDay: null,
      ninetyDay: null
    });
    expect(mocks.GET).toHaveBeenCalledTimes(3);
    expect(mocks.GET).toHaveBeenCalledWith("/v1/insights/cash-flow-forecast", {
      params: { query: { days: 30 } }
    });
    expect(mocks.GET).toHaveBeenCalledWith("/v1/insights/cash-flow-forecast", {
      params: { query: { days: 60 } }
    });
    expect(mocks.GET).toHaveBeenCalledWith("/v1/insights/cash-flow-forecast", {
      params: { query: { days: 90 } }
    });
  });

  it("returns null forecasts when the API sends an empty successful response", async () => {
    mocks.GET.mockResolvedValue({ response: { status: 200 } });
    const { getCashflowForecasts } = await import("./get-cashflow-forecasts");

    await expect(getCashflowForecasts()).resolves.toEqual({
      thirtyDay: null,
      sixtyDay: null,
      ninetyDay: null
    });
  });

  it("returns parsed snapshots when available", async () => {
    mocks.GET.mockImplementation(
      async (_url: string, { params }: { params: { query: { days: number } } }) => {
        if (params.query.days === 30) {
          return { data: { ...validSnapshot, horizonDays: 30 }, response: { status: 200 } };
        }
        return { data: null, response: { status: 200 } };
      }
    );
    const { getCashflowForecasts } = await import("./get-cashflow-forecasts");

    const forecasts = await getCashflowForecasts();
    expect(forecasts.thirtyDay).not.toBeNull();
    expect(forecasts.thirtyDay?.horizonDays).toBe(30);
    expect(forecasts.thirtyDay?.asOf).toBeInstanceOf(Date);
    expect(forecasts.sixtyDay).toBeNull();
    expect(forecasts.ninetyDay).toBeNull();
  });

  it("propagates API error responses as AppErrors", async () => {
    mocks.GET.mockResolvedValue({
      error: {
        type: "https://httpstatuses.com/400",
        title: "Bad Request",
        message: "Invalid input"
      },
      response: { status: 400 }
    });
    const { getCashflowForecasts } = await import("./get-cashflow-forecasts");

    await expect(getCashflowForecasts()).rejects.toThrow();
  });

  it("throws when receiving invalid snapshot payload", async () => {
    mocks.GET.mockResolvedValue({
      data: { invalid: "payload" },
      response: { status: 200 }
    });
    const { getCashflowForecasts } = await import("./get-cashflow-forecasts");

    await expect(getCashflowForecasts()).rejects.toThrow(
      /Invalid 30-day cash-flow forecast response/
    );
  });
});
