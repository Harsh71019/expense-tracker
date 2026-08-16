import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ GET: vi.fn(), getServerApiClient: vi.fn() }));
vi.mock("@/lib/api/server", () => ({ getServerApiClient: mocks.getServerApiClient }));

const UNCONFIGURED_STATE = {
  configured: false,
  profile: null,
  currentSalaryVersion: null,
  upcomingSalaryVersion: null,
  suggestedMonthlyWorkMinutes: 9_600,
  asOf: "2026-08-16T00:00:00.000Z"
};

const VERSION = {
  id: "3fa85f64-5717-4562-b3fc-2c963f66be00",
  userId: "user-1",
  netMonthlySalaryMinor: 12_50_000,
  annualCtcMinor: null,
  effectiveFrom: "2026-04-01T00:00:00.000Z",
  source: "manually_confirmed",
  createdAt: "2026-04-01T00:00:00.000Z"
};

const CONFIGURED_STATE = {
  ...UNCONFIGURED_STATE,
  configured: true,
  profile: {
    userId: "user-1",
    monthlyWorkMinutes: 9_600,
    salaryCreditDay: 1,
    expectedAnnualIncrementBps: null,
    incomeStability: "stable",
    createdAt: "2026-04-01T00:00:00.000Z",
    updatedAt: "2026-04-01T00:00:00.000Z"
  },
  currentSalaryVersion: VERSION
};

const STATISTICS = {
  currentNetMonthlySalaryMinor: 12_50_000,
  annualizedNetIncomeMinor: 1_50_00_000,
  netHourlyWageMinor: 7_813,
  eightHourWorkdayEquivalentMinor: 62_500,
  effectiveFrom: "2026-04-01T00:00:00.000Z",
  monthlyWorkMinutes: 9_600,
  salaryVersionId: VERSION.id,
  computedAt: "2026-08-16T00:00:00.000Z",
  formulaVersion: 1,
  dataQuality: "complete",
  assumptions: {
    monthsPerYear: 12,
    minutesPerHour: 60,
    standardWorkdayMinutes: 480,
    monthlyWorkMinutes: 9_600,
    incomeStability: "stable",
    expectedAnnualIncrementBps: null,
    rounding: "half_up"
  },
  limitations: []
};

describe("financial profile server loaders", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.GET.mockReset();
    mocks.getServerApiClient.mockReset();
    mocks.getServerApiClient.mockResolvedValue({ GET: mocks.GET });
  });

  it("loads the unconfigured setup state for a first-time user", async () => {
    mocks.GET.mockResolvedValue({ data: UNCONFIGURED_STATE });
    const { getFinancialProfileState } = await import("./get-financial-profile");

    await expect(getFinancialProfileState()).resolves.toMatchObject({
      configured: false,
      profile: null,
      suggestedMonthlyWorkMinutes: 9_600
    });
    expect(mocks.GET).toHaveBeenCalledWith("/v1/financial-profile");
  });

  it("loads a populated state with the current salary version", async () => {
    mocks.GET.mockResolvedValue({ data: CONFIGURED_STATE });
    const { getFinancialProfileState } = await import("./get-financial-profile");

    const state = await getFinancialProfileState();
    expect(state?.configured).toBe(true);
    expect(state?.currentSalaryVersion?.netMonthlySalaryMinor).toBe(12_50_000);
    expect(state?.currentSalaryVersion?.effectiveFrom).toBeInstanceOf(Date);
  });

  it("fails closed to null for a state that does not match the shared schema", async () => {
    mocks.GET.mockResolvedValue({ data: { configured: "maybe" } });
    const { getFinancialProfileState } = await import("./get-financial-profile");

    await expect(getFinancialProfileState()).resolves.toBeNull();
  });

  it("fails closed to null when the state request throws", async () => {
    mocks.getServerApiClient.mockRejectedValue(new Error("offline"));
    const { getFinancialProfileState } = await import("./get-financial-profile");

    await expect(getFinancialProfileState()).resolves.toBeNull();
  });

  it("loads statistics and returns null before setup", async () => {
    mocks.GET.mockResolvedValue({ data: STATISTICS });
    const { getSalaryStatistics } = await import("./get-financial-profile");

    await expect(getSalaryStatistics()).resolves.toMatchObject({ netHourlyWageMinor: 7_813 });
    expect(mocks.GET).toHaveBeenCalledWith("/v1/financial-profile/salary-statistics", {
      params: { query: {} }
    });

    vi.resetModules();
    mocks.GET.mockResolvedValue({ data: undefined });
    const reloaded = await import("./get-financial-profile");
    await expect(reloaded.getSalaryStatistics()).resolves.toBeNull();
  });

  it("loads an empty and a populated history page with the default page size", async () => {
    mocks.GET.mockResolvedValue({
      data: { items: [], pageInfo: { nextCursor: null, hasMore: false, limit: 20 } }
    });
    const { SALARY_HISTORY_PAGE_SIZE, getSalaryVersionPage } =
      await import("./get-financial-profile");

    await expect(getSalaryVersionPage()).resolves.toMatchObject({ items: [] });
    expect(mocks.GET).toHaveBeenCalledWith("/v1/financial-profile/salary-versions", {
      params: { query: { limit: SALARY_HISTORY_PAGE_SIZE } }
    });

    vi.resetModules();
    mocks.GET.mockResolvedValue({
      data: { items: [VERSION], pageInfo: { nextCursor: "c1", hasMore: true, limit: 20 } }
    });
    const reloaded = await import("./get-financial-profile");
    const page = await reloaded.getSalaryVersionPage();
    expect(page?.items).toHaveLength(1);
    expect(page?.pageInfo.hasMore).toBe(true);
  });
});
