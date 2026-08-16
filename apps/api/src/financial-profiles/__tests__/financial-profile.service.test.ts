import {
  SUGGESTED_MONTHLY_WORK_MINUTES,
  type FinancialProfile,
  type SalaryVersion
} from "@treasury-ops/shared";
import { describe, expect, it, vi } from "vitest";

import { DuplicateSalaryEffectiveDateError } from "../../common/errors/duplicate-salary-effective-date.error.js";
import { FinancialProfileNotConfiguredError } from "../../common/errors/financial-profile-not-configured.error.js";
import { MoneyOutOfRangeError } from "../../common/errors/money-out-of-range.error.js";
import { focusedTestDouble } from "../../test/mock-drizzle.js";
import { FinancialProfileService } from "../financial-profile.service.js";

const ASOF = new Date("2026-08-16T00:00:00.000Z");
const VERSION_ID = "11111111-1111-4111-8111-111111111111";

const PROFILE: FinancialProfile = {
  userId: "user-a",
  monthlyWorkMinutes: 9_600,
  salaryCreditDay: 1,
  expectedAnnualIncrementBps: null,
  incomeStability: "stable",
  createdAt: new Date("2026-04-01T00:00:00.000Z"),
  updatedAt: new Date("2026-04-01T00:00:00.000Z")
};

const VERSION: SalaryVersion = {
  id: VERSION_ID,
  userId: "user-a",
  netMonthlySalaryMinor: 12_50_000,
  annualCtcMinor: null,
  effectiveFrom: new Date("2026-04-01T00:00:00.000Z"),
  source: "manually_confirmed",
  createdAt: new Date("2026-04-01T00:00:00.000Z")
};

function createService(
  options: Readonly<{
    profile?: FinancialProfile | null;
    effective?: SalaryVersion | null;
    upcoming?: SalaryVersion | null;
  }> = {}
) {
  const tx = { tx: true };
  const profiles = {
    findProfile: vi.fn().mockResolvedValue(options.profile ?? null),
    findEffectiveSalaryVersion: vi.fn().mockResolvedValue(options.effective ?? null),
    findUpcomingSalaryVersion: vi.fn().mockResolvedValue(options.upcoming ?? null),
    upsertProfile: vi.fn().mockResolvedValue(PROFILE),
    createSalaryVersion: vi.fn().mockResolvedValue(VERSION),
    listSalaryVersions: vi.fn().mockResolvedValue({ items: [], hasMore: false, nextCursor: null })
  };
  const audit = { record: vi.fn().mockResolvedValue(undefined) };
  const idempotency = {
    execute: vi.fn(
      async (
        _userId: string,
        _operation: string,
        _key: string,
        _intent: unknown,
        _schema: unknown,
        work: (value: object) => Promise<unknown>
      ) => ({ result: await work(tx), replayed: false })
    )
  };
  const service = new FinancialProfileService(
    focusedTestDouble(profiles),
    focusedTestDouble(audit),
    focusedTestDouble(idempotency)
  );
  return { service, profiles, audit, idempotency, tx };
}

describe("FinancialProfileService state", () => {
  it("reports an explicit setup state without fabricating a salary", async () => {
    const { service } = createService();
    const state = await service.getState("user-a", ASOF);

    expect(state).toEqual({
      configured: false,
      profile: null,
      currentSalaryVersion: null,
      upcomingSalaryVersion: null,
      suggestedMonthlyWorkMinutes: SUGGESTED_MONTHLY_WORK_MINUTES,
      asOf: ASOF
    });
  });

  it("is unconfigured while a profile exists but no salary version does", async () => {
    const { service } = createService({ profile: PROFILE });
    expect((await service.getState("user-a", ASOF)).configured).toBe(false);
  });

  it("is configured once a profile and an effective version exist", async () => {
    const { service } = createService({ profile: PROFILE, effective: VERSION });
    const state = await service.getState("user-a", ASOF);
    expect(state.configured).toBe(true);
    expect(state.currentSalaryVersion?.id).toBe(VERSION_ID);
  });

  it("scopes every read to the caller", async () => {
    const { service, profiles } = createService({ profile: PROFILE, effective: VERSION });
    await service.getState("user-a", ASOF);
    expect(profiles.findProfile).toHaveBeenCalledWith("user-a");
    expect(profiles.findEffectiveSalaryVersion).toHaveBeenCalledWith("user-a", ASOF);
    expect(profiles.findUpcomingSalaryVersion).toHaveBeenCalledWith("user-a", ASOF);
  });
});

describe("FinancialProfileService.updateProfile", () => {
  const input = {
    monthlyWorkMinutes: 9_600,
    incomeStability: "stable",
    salaryCreditDay: 1,
    expectedAnnualIncrementBps: null
  } as const;

  it("upserts and audits inside the same idempotent unit of work", async () => {
    const { service, profiles, audit, idempotency, tx } = createService();
    const result = await service.updateProfile("user-a", input, "key-1");

    expect(result).toEqual({ result: PROFILE, replayed: false });
    expect(idempotency.execute.mock.calls[0]?.[1]).toBe("financial_profile.update");
    expect(profiles.upsertProfile).toHaveBeenCalledWith("user-a", input, tx);
    expect(audit.record).toHaveBeenCalledWith("user-a", "financial_profile.update", "user-a", tx, {
      monthlyWorkMinutes: 9_600,
      incomeStability: "stable",
      hasSalaryCreditDay: true,
      hasExpectedAnnualIncrement: false
    });
  });
});

describe("FinancialProfileService.addSalaryVersion", () => {
  const input = {
    netMonthlySalaryMinor: 12_50_000,
    annualCtcMinor: null,
    effectiveFrom: new Date("2026-04-01T09:45:00.000Z")
  };

  it("normalizes the effective date to the start of its IST calendar day", async () => {
    const { service, profiles, tx } = createService();
    await service.addSalaryVersion("user-a", input, "key-1");

    expect(profiles.createSalaryVersion).toHaveBeenCalledWith(
      "user-a",
      {
        netMonthlySalaryMinor: 12_50_000,
        annualCtcMinor: null,
        // 2026-04-01 09:45 UTC is 15:15 IST on 1 April, whose IST day starts
        // at 2026-03-31T18:30:00Z.
        effectiveFrom: new Date("2026-03-31T18:30:00.000Z"),
        source: "manually_confirmed"
      },
      tx
    );
  });

  it("fingerprints the normalized intent so a retry replays instead of duplicating", async () => {
    const { service, idempotency } = createService();
    await service.addSalaryVersion("user-a", input, "key-1");
    await service.addSalaryVersion(
      "user-a",
      { ...input, effectiveFrom: new Date("2026-04-01T18:00:00.000Z") },
      "key-1"
    );
    expect(idempotency.execute.mock.calls[0]?.[3]).toEqual(idempotency.execute.mock.calls[1]?.[3]);
  });

  it("audits the version without recording the salary or CTC value", async () => {
    const { service, audit, tx } = createService();
    await service.addSalaryVersion("user-a", input, "key-1");

    expect(audit.record).toHaveBeenCalledWith(
      "user-a",
      "financial_profile.salary_version.create",
      VERSION_ID,
      tx,
      {
        effectiveFrom: "2026-04-01T00:00:00.000Z",
        source: "manually_confirmed",
        hasAnnualCtc: false
      }
    );
    const meta = audit.record.mock.calls[0]?.[4];
    expect(JSON.stringify(meta)).not.toContain("1250000");
  });

  it("maps the unique-effective-date violation to a duplicate-date conflict", async () => {
    const { service, profiles } = createService();
    profiles.createSalaryVersion.mockRejectedValue(
      Object.assign(new Error("duplicate"), {
        code: "23505",
        constraint: "salary_versions_user_id_effective_from_unique"
      })
    );

    await expect(service.addSalaryVersion("user-a", input, "key-1")).rejects.toThrow(
      DuplicateSalaryEffectiveDateError
    );
  });

  it("rethrows an unrelated database failure untouched", async () => {
    const { service, profiles } = createService();
    profiles.createSalaryVersion.mockRejectedValue(new Error("connection reset"));
    await expect(service.addSalaryVersion("user-a", input, "key-1")).rejects.toThrow(
      "connection reset"
    );
  });
});

describe("FinancialProfileService.listSalaryVersions", () => {
  it("returns a cursor page shaped for the shared contract", async () => {
    const { service, profiles } = createService();
    profiles.listSalaryVersions.mockResolvedValue({
      items: [VERSION],
      hasMore: true,
      nextCursor: "cursor-1"
    });

    expect(await service.listSalaryVersions("user-a", { limit: 25 })).toEqual({
      items: [VERSION],
      pageInfo: { nextCursor: "cursor-1", hasMore: true, limit: 25 }
    });
  });
});

describe("FinancialProfileService.getStatistics", () => {
  it("refuses to derive statistics before setup", async () => {
    await expect(createService().service.getStatistics("user-a", ASOF)).rejects.toThrow(
      FinancialProfileNotConfiguredError
    );
    await expect(
      createService({ profile: PROFILE }).service.getStatistics("user-a", ASOF)
    ).rejects.toThrow(FinancialProfileNotConfiguredError);
    await expect(
      createService({ effective: VERSION }).service.getStatistics("user-a", ASOF)
    ).rejects.toThrow(FinancialProfileNotConfiguredError);
  });

  it("derives figures from the effective version only", async () => {
    const { service } = createService({ profile: PROFILE, effective: VERSION });
    const statistics = await service.getStatistics("user-a", ASOF);
    expect(statistics.currentNetMonthlySalaryMinor).toBe(12_50_000);
    expect(statistics.annualizedNetIncomeMinor).toBe(1_50_00_000);
    expect(statistics.salaryVersionId).toBe(VERSION_ID);
  });

  it("translates an unsafe integer calculation into a money-range problem", async () => {
    const { service } = createService({
      profile: PROFILE,
      effective: { ...VERSION, netMonthlySalaryMinor: Number.MAX_SAFE_INTEGER }
    });
    await expect(service.getStatistics("user-a", ASOF)).rejects.toThrow(MoneyOutOfRangeError);
  });
});
