import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { AuditRepository } from "../../../src/audit/audit.repository.js";
import { auditLog, salaryVersions } from "../../../src/common/db/schema/index.js";
import { DuplicateSalaryEffectiveDateError } from "../../../src/common/errors/duplicate-salary-effective-date.error.js";
import { FinancialProfileNotConfiguredError } from "../../../src/common/errors/financial-profile-not-configured.error.js";
import { IdempotencyPostgresRepository } from "../../../src/common/idempotency/idempotency-postgres.repository.js";
import { IdempotencyPostgresService } from "../../../src/common/idempotency/idempotency-postgres.service.js";
import { FinancialProfileRepository } from "../../../src/financial-profiles/financial-profile.repository.js";
import { FinancialProfileService } from "../../../src/financial-profiles/financial-profile.service.js";
import { createTestDb, insertTestUser } from "../support/postgres-test-db.js";
import type { TestDb } from "../support/postgres-test-db.js";

const ASOF = new Date("2026-08-16T00:00:00.000Z");
const PROFILE_INPUT = {
  monthlyWorkMinutes: 9_600,
  incomeStability: "stable",
  salaryCreditDay: 1,
  expectedAnnualIncrementBps: null
} as const;

function key(seed: string): string {
  return `${seed}-1111-4111-8111-111111111111`;
}

describe("FinancialProfileService", () => {
  let testDb: TestDb;
  let service: FinancialProfileService;

  beforeAll(async () => {
    testDb = await createTestDb();
    service = new FinancialProfileService(
      new FinancialProfileRepository(testDb.db),
      new AuditRepository(testDb.db),
      new IdempotencyPostgresService(testDb.db, new IdempotencyPostgresRepository(testDb.db))
    );
    for (const userId of ["user-a", "user-b", "user-concurrent", "user-future"]) {
      await insertTestUser(testDb.db, userId);
    }
  }, 60_000);

  afterAll(async () => {
    await testDb.teardown();
  });

  it("refuses statistics and reports an unconfigured state before setup", async () => {
    expect(await service.getState("user-a", ASOF)).toMatchObject({
      configured: false,
      profile: null,
      currentSalaryVersion: null,
      suggestedMonthlyWorkMinutes: 9_600
    });
    await expect(service.getStatistics("user-a", ASOF)).rejects.toThrow(
      FinancialProfileNotConfiguredError
    );
  });

  it("saves the profile and salary version atomically with their audit entries", async () => {
    await service.updateProfile("user-a", PROFILE_INPUT, key("aaaaaaaa"));
    const created = await service.addSalaryVersion(
      "user-a",
      {
        netMonthlySalaryMinor: 12_50_000,
        annualCtcMinor: 2_40_00_000,
        effectiveFrom: new Date("2026-04-01T09:45:00.000Z")
      },
      key("bbbbbbbb")
    );

    expect(created.replayed).toBe(false);
    // Normalized to the start of the 1 April Asia/Kolkata calendar day.
    expect(created.result.effectiveFrom.toISOString()).toBe("2026-03-31T18:30:00.000Z");

    const entries = await testDb.db.select().from(auditLog).where(eq(auditLog.userId, "user-a"));
    const actions = entries.map((entry) => entry.action);
    expect(actions).toContain("financial_profile.update");
    expect(actions).toContain("financial_profile.salary_version.create");

    // Audit records the operation and affected ids, never the money values.
    const serialized = JSON.stringify(entries.map((entry) => entry.meta));
    expect(serialized).not.toContain("1250000");
    expect(serialized).not.toContain("24000000");
    expect(serialized).toContain("hasAnnualCtc");
  });

  it("derives statistics from the effective version only", async () => {
    const statistics = await service.getStatistics("user-a", ASOF);
    expect(statistics).toMatchObject({
      currentNetMonthlySalaryMinor: 12_50_000,
      annualizedNetIncomeMinor: 1_50_00_000,
      netHourlyWageMinor: 7_813,
      eightHourWorkdayEquivalentMinor: 62_500,
      monthlyWorkMinutes: 9_600,
      dataQuality: "complete",
      formulaVersion: 1
    });
    expect(statistics.limitations.join(" ")).toContain("Annual CTC");
  });

  it("keeps a future salary change out of current statistics until it takes effect", async () => {
    await service.updateProfile("user-future", PROFILE_INPUT, key("cccccccc"));
    await service.addSalaryVersion(
      "user-future",
      {
        netMonthlySalaryMinor: 12_50_000,
        annualCtcMinor: null,
        effectiveFrom: new Date("2026-04-01T00:00:00.000Z")
      },
      key("dddddddd")
    );
    await service.addSalaryVersion(
      "user-future",
      {
        netMonthlySalaryMinor: 20_00_000,
        annualCtcMinor: null,
        effectiveFrom: new Date("2026-12-01T00:00:00.000Z")
      },
      key("eeeeeeee")
    );

    const now = await service.getStatistics("user-future", ASOF);
    expect(now.currentNetMonthlySalaryMinor).toBe(12_50_000);
    expect(now.limitations.join(" ")).toContain("future salary change");

    const later = await service.getStatistics("user-future", new Date("2026-12-25T00:00:00.000Z"));
    expect(later.currentNetMonthlySalaryMinor).toBe(20_00_000);

    const state = await service.getState("user-future", ASOF);
    expect(state.currentSalaryVersion?.netMonthlySalaryMinor).toBe(12_50_000);
    expect(state.upcomingSalaryVersion?.netMonthlySalaryMinor).toBe(20_00_000);
  });

  it("replays a repeated mutation instead of appending a second version", async () => {
    const input = {
      netMonthlySalaryMinor: 13_00_000,
      annualCtcMinor: null,
      effectiveFrom: new Date("2026-09-01T00:00:00.000Z")
    };
    const first = await service.addSalaryVersion("user-a", input, key("ffffffff"));
    const retry = await service.addSalaryVersion("user-a", input, key("ffffffff"));

    expect(first.replayed).toBe(false);
    expect(retry.replayed).toBe(true);
    expect(retry.result.id).toBe(first.result.id);
  });

  it("rejects a second version on an effective date already used", async () => {
    await expect(
      service.addSalaryVersion(
        "user-a",
        {
          netMonthlySalaryMinor: 19_00_000,
          annualCtcMinor: null,
          effectiveFrom: new Date("2026-09-01T11:00:00.000Z")
        },
        key("99999999")
      )
    ).rejects.toThrow(DuplicateSalaryEffectiveDateError);
  });

  it("creates exactly one version across five concurrent identical requests", async () => {
    await service.updateProfile("user-concurrent", PROFILE_INPUT, key("12121212"));
    const input = {
      netMonthlySalaryMinor: 11_00_000,
      annualCtcMinor: null,
      effectiveFrom: new Date("2026-05-01T00:00:00.000Z")
    };

    const results = await Promise.all(
      Array.from({ length: 5 }, () =>
        service.addSalaryVersion("user-concurrent", input, key("34343434"))
      )
    );

    expect(results.filter((result) => !result.replayed)).toHaveLength(1);
    expect(new Set(results.map((result) => result.result.id)).size).toBe(1);
    expect(
      await testDb.db
        .select()
        .from(salaryVersions)
        .where(eq(salaryVersions.userId, "user-concurrent"))
    ).toHaveLength(1);
  });

  it("applies exactly one profile write across five concurrent identical requests", async () => {
    const results = await Promise.all(
      Array.from({ length: 5 }, () =>
        service.updateProfile(
          "user-concurrent",
          { ...PROFILE_INPUT, monthlyWorkMinutes: 10_080 },
          key("56565656")
        )
      )
    );

    expect(results.filter((result) => !result.replayed)).toHaveLength(1);
    expect(new Set(results.map((result) => result.result.updatedAt.toISOString())).size).toBe(1);

    const entries = await testDb.db
      .select()
      .from(auditLog)
      .where(
        and(eq(auditLog.userId, "user-concurrent"), eq(auditLog.action, "financial_profile.update"))
      );
    expect(entries).toHaveLength(2);
  });

  it("pages salary history newest first, scoped to the caller", async () => {
    await service.updateProfile("user-b", PROFILE_INPUT, key("78787878"));
    await service.addSalaryVersion(
      "user-b",
      {
        netMonthlySalaryMinor: 5_00_000,
        annualCtcMinor: null,
        effectiveFrom: new Date("2026-01-01T00:00:00.000Z")
      },
      key("9a9a9a9a")
    );

    const page = await service.listSalaryVersions("user-b", { limit: 50 });
    expect(page.items).toHaveLength(1);
    expect(page.items[0]?.netMonthlySalaryMinor).toBe(5_00_000);
    expect(page.pageInfo).toEqual({ nextCursor: null, hasMore: false, limit: 50 });

    const otherTenant = await service.listSalaryVersions("user-a", { limit: 50 });
    expect(otherTenant.items.every((item) => item.userId === "user-a")).toBe(true);
    expect(otherTenant.items.map((item) => item.effectiveFrom.getTime())).toEqual(
      [...otherTenant.items.map((item) => item.effectiveFrom.getTime())].sort((a, b) => b - a)
    );
  });
});
