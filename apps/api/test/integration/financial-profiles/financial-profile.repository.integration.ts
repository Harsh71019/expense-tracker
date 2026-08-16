import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { withTxn } from "../../../src/common/db/db-txn.js";
import { postgresConstraint } from "../../../src/common/db/postgres-error.js";
import { salaryVersions } from "../../../src/common/db/schema/index.js";
import { InvalidCursorError } from "../../../src/common/errors/invalid-cursor.error.js";
import { FinancialProfileRepository } from "../../../src/financial-profiles/financial-profile.repository.js";
import { createTestDb, insertTestUser } from "../support/postgres-test-db.js";
import type { TestDb } from "../support/postgres-test-db.js";

const APRIL = new Date("2026-04-01T00:00:00.000Z");
const JULY = new Date("2026-07-01T00:00:00.000Z");
const DECEMBER = new Date("2026-12-01T00:00:00.000Z");
const ASOF = new Date("2026-08-16T00:00:00.000Z");

const PROFILE_INPUT = {
  monthlyWorkMinutes: 9_600,
  incomeStability: "stable",
  salaryCreditDay: 1,
  expectedAnnualIncrementBps: null
} as const;

describe("FinancialProfileRepository", () => {
  let testDb: TestDb;
  let profiles: FinancialProfileRepository;

  beforeAll(async () => {
    testDb = await createTestDb();
    profiles = new FinancialProfileRepository(testDb.db);
    for (const userId of ["user-a", "user-b", "user-history", "user-cursor"]) {
      await insertTestUser(testDb.db, userId);
    }
  }, 60_000);

  afterAll(async () => {
    await testDb.teardown();
  });

  it("creates a profile, then replaces the whole preference set on update", async () => {
    expect(await profiles.findProfile("user-a")).toBeNull();

    const created = await withTxn(testDb.db, (tx) =>
      profiles.upsertProfile("user-a", PROFILE_INPUT, tx)
    );
    expect(created).toMatchObject({
      userId: "user-a",
      monthlyWorkMinutes: 9_600,
      salaryCreditDay: 1,
      expectedAnnualIncrementBps: null,
      incomeStability: "stable"
    });

    const updated = await withTxn(testDb.db, (tx) =>
      profiles.upsertProfile(
        "user-a",
        {
          monthlyWorkMinutes: 8_400,
          incomeStability: "variable",
          salaryCreditDay: null,
          expectedAnnualIncrementBps: 900
        },
        tx
      )
    );
    expect(updated).toMatchObject({
      monthlyWorkMinutes: 8_400,
      incomeStability: "variable",
      salaryCreditDay: null,
      expectedAnnualIncrementBps: 900
    });
    expect(updated.createdAt.getTime()).toBe(created.createdAt.getTime());
    expect(await profiles.findProfile("user-b")).toBeNull();
  });

  it("never reads or writes another tenant's profile or salary history", async () => {
    await withTxn(testDb.db, (tx) =>
      profiles.upsertProfile("user-b", { ...PROFILE_INPUT, monthlyWorkMinutes: 10_080 }, tx)
    );
    await withTxn(testDb.db, (tx) =>
      profiles.createSalaryVersion(
        "user-b",
        {
          netMonthlySalaryMinor: 99_00_000,
          annualCtcMinor: null,
          effectiveFrom: APRIL,
          source: "manually_confirmed"
        },
        tx
      )
    );

    expect((await profiles.findProfile("user-a"))?.monthlyWorkMinutes).toBe(8_400);
    expect((await profiles.findProfile("user-b"))?.monthlyWorkMinutes).toBe(10_080);
    expect(await profiles.findEffectiveSalaryVersion("user-a", ASOF)).toBeNull();
    expect((await profiles.listSalaryVersions("user-a", { limit: 50 })).items).toHaveLength(0);
    expect((await profiles.listSalaryVersions("user-b", { limit: 50 })).items).toHaveLength(1);
  });

  it("selects the newest effective version and ignores future-dated ones", async () => {
    await withTxn(testDb.db, (tx) => profiles.upsertProfile("user-history", PROFILE_INPUT, tx));
    const first = await withTxn(testDb.db, (tx) =>
      profiles.createSalaryVersion(
        "user-history",
        {
          netMonthlySalaryMinor: 12_50_000,
          annualCtcMinor: null,
          effectiveFrom: APRIL,
          source: "manually_confirmed"
        },
        tx
      )
    );
    const second = await withTxn(testDb.db, (tx) =>
      profiles.createSalaryVersion(
        "user-history",
        {
          netMonthlySalaryMinor: 14_00_000,
          annualCtcMinor: 2_40_00_000,
          effectiveFrom: JULY,
          source: "manually_confirmed"
        },
        tx
      )
    );
    const future = await withTxn(testDb.db, (tx) =>
      profiles.createSalaryVersion(
        "user-history",
        {
          netMonthlySalaryMinor: 16_00_000,
          annualCtcMinor: null,
          effectiveFrom: DECEMBER,
          source: "manually_confirmed"
        },
        tx
      )
    );

    expect((await profiles.findEffectiveSalaryVersion("user-history", ASOF))?.id).toBe(second.id);
    expect((await profiles.findUpcomingSalaryVersion("user-history", ASOF))?.id).toBe(future.id);
    expect((await profiles.findEffectiveSalaryVersion("user-history", APRIL))?.id).toBe(first.id);
    expect(await profiles.findEffectiveSalaryVersion("user-history", new Date("2026-01-01"))).toBe(
      null
    );
    expect((await profiles.findEffectiveSalaryVersion("user-history", DECEMBER))?.id).toBe(
      future.id
    );

    // Appending never rewrote the earlier versions.
    const stored = await testDb.db
      .select()
      .from(salaryVersions)
      .where(and(eq(salaryVersions.userId, "user-history"), eq(salaryVersions.id, first.id)));
    expect(stored[0]?.netMonthlySalaryMinor).toBe(12_50_000);
  });

  it("rejects a duplicate effective date for the same user but allows it across users", async () => {
    expect(
      await violatedConstraint(() =>
        withTxn(testDb.db, (tx) =>
          profiles.createSalaryVersion(
            "user-history",
            {
              netMonthlySalaryMinor: 15_00_000,
              annualCtcMinor: null,
              effectiveFrom: JULY,
              source: "manually_confirmed"
            },
            tx
          )
        )
      )
    ).toBe("salary_versions_user_id_effective_from_unique");

    await expect(
      withTxn(testDb.db, (tx) =>
        profiles.createSalaryVersion(
          "user-b",
          {
            netMonthlySalaryMinor: 15_00_000,
            annualCtcMinor: null,
            effectiveFrom: JULY,
            source: "manually_confirmed"
          },
          tx
        )
      )
    ).resolves.toMatchObject({ userId: "user-b" });
  });

  it("pages history newest first through a stable cursor", async () => {
    for (let month = 1; month <= 5; month += 1) {
      await withTxn(testDb.db, (tx) =>
        profiles.createSalaryVersion(
          "user-cursor",
          {
            netMonthlySalaryMinor: 10_00_000 + month,
            annualCtcMinor: null,
            effectiveFrom: new Date(Date.UTC(2026, month - 1, 1)),
            source: "manually_confirmed"
          },
          tx
        )
      );
    }

    const first = await profiles.listSalaryVersions("user-cursor", { limit: 2 });
    expect(first.items.map((item) => item.effectiveFrom.toISOString())).toEqual([
      "2026-05-01T00:00:00.000Z",
      "2026-04-01T00:00:00.000Z"
    ]);
    expect(first.hasMore).toBe(true);
    expect(first.nextCursor).not.toBeNull();

    const second = await profiles.listSalaryVersions("user-cursor", {
      limit: 2,
      cursor: first.nextCursor ?? undefined
    });
    expect(second.items.map((item) => item.effectiveFrom.toISOString())).toEqual([
      "2026-03-01T00:00:00.000Z",
      "2026-02-01T00:00:00.000Z"
    ]);

    const third = await profiles.listSalaryVersions("user-cursor", {
      limit: 2,
      cursor: second.nextCursor ?? undefined
    });
    expect(third.items).toHaveLength(1);
    expect(third.hasMore).toBe(false);
    expect(third.nextCursor).toBeNull();
  });

  it("rejects a malformed cursor rather than silently restarting the page", async () => {
    await expect(
      profiles.listSalaryVersions("user-cursor", { limit: 2, cursor: "not-a-cursor" })
    ).rejects.toThrow(InvalidCursorError);
  });

  it("enforces the money and calendar check constraints in the database", async () => {
    expect(
      await violatedConstraint(() =>
        testDb.db.insert(salaryVersions).values({
          userId: "user-a",
          netMonthlySalaryMinor: 0,
          annualCtcMinor: null,
          effectiveFrom: APRIL,
          source: "manually_confirmed",
          createdAt: new Date()
        })
      )
    ).toBe("salary_versions_net_monthly_salary_minor_positive");

    expect(
      await violatedConstraint(() =>
        withTxn(testDb.db, (tx) =>
          profiles.upsertProfile("user-a", { ...PROFILE_INPUT, monthlyWorkMinutes: 44_641 }, tx)
        )
      )
    ).toBe("financial_profiles_monthly_work_minutes_valid");
  });
});

/**
 * Drizzle wraps the driver error, so the constraint name is on `.cause`, not
 * in the thrown message — assert on the unwrapped name rather than the text.
 */
async function violatedConstraint(work: () => Promise<unknown>): Promise<string | undefined> {
  try {
    await work();
  } catch (error) {
    return postgresConstraint(error);
  }
  throw new Error("Expected the write to violate a database constraint.");
}
