import type { UpsertProtection } from "@treasury-ops/shared";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { AuditRepository } from "../../../src/audit/audit.repository.js";
import { auditLog, protectionSnapshots } from "../../../src/common/db/schema/index.js";
import { DuplicateProtectionEffectiveDateError } from "../../../src/common/errors/duplicate-protection-effective-date.error.js";
import { IdempotencyPostgresRepository } from "../../../src/common/idempotency/idempotency-postgres.repository.js";
import { IdempotencyPostgresService } from "../../../src/common/idempotency/idempotency-postgres.service.js";
import { ProtectionRepository } from "../../../src/financial-profiles/protection.repository.js";
import { ProtectionService } from "../../../src/financial-profiles/protection.service.js";
import { createTestDb, insertTestUser } from "../support/postgres-test-db.js";
import type { TestDb } from "../support/postgres-test-db.js";

const ASOF = new Date("2026-08-16T00:00:00.000Z");

function key(seed: string): string {
  return `${seed}-1111-4111-8111-111111111111`;
}

function input(overrides: Partial<UpsertProtection> = {}): UpsertProtection {
  return {
    effectiveFrom: new Date("2026-04-01T00:00:00.000Z"),
    termCoverStatus: "none",
    independentTermCoverMinor: null,
    employerTermCoverMinor: null,
    independentTermExpiresOn: null,
    termNotApplicableReason: null,
    healthCoverStatus: "none",
    independentHealthBaseCoverMinor: null,
    independentHealthSuperTopUpMinor: null,
    employerHealthCoverMinor: null,
    independentHealthExpiresOn: null,
    dependantCount: 0,
    ...overrides
  };
}

describe("ProtectionService", () => {
  let testDb: TestDb;
  let service: ProtectionService;

  beforeAll(async () => {
    testDb = await createTestDb();
    service = new ProtectionService(
      new ProtectionRepository(testDb.db),
      new AuditRepository(testDb.db),
      new IdempotencyPostgresService(testDb.db, new IdempotencyPostgresRepository(testDb.db))
    );
    for (const userId of ["user-a", "user-b", "user-concurrent", "user-future", "user-audit"]) {
      await insertTestUser(testDb.db, userId);
    }
  }, 60_000);

  afterAll(async () => {
    await testDb.teardown();
  });

  it("reports an explicit unknown state before any snapshot exists", async () => {
    expect(await service.getState("user-a", ASOF)).toMatchObject({
      configured: false,
      currentSnapshot: null,
      upcomingSnapshot: null,
      dataQuality: "unavailable",
      termCover: { state: "not_configured" },
      healthCover: { state: "not_configured" }
    });
  });

  it("appends a snapshot with its audit entry atomically and normalizes the effective day to IST", async () => {
    const created = await service.upsertProtection(
      "user-a",
      input({
        effectiveFrom: new Date("2026-04-01T09:45:00.000Z"),
        termCoverStatus: "employer_only",
        employerTermCoverMinor: 50_00_000,
        healthCoverStatus: "both",
        independentHealthBaseCoverMinor: 10_00_000,
        independentHealthSuperTopUpMinor: 40_00_000,
        employerHealthCoverMinor: 5_00_000,
        dependantCount: 2
      }),
      key("aaaaaaaa")
    );

    // 2026-04-01T09:45Z is 15:15 IST on 1 April, so the day starts 2026-03-31T18:30Z.
    expect(created.result.effectiveFrom).toEqual(new Date("2026-03-31T18:30:00.000Z"));
    expect(created.replayed).toBe(false);

    const [row] = await testDb.db
      .select()
      .from(protectionSnapshots)
      .where(eq(protectionSnapshots.id, created.result.id));
    expect(row).toMatchObject({
      userId: "user-a",
      termCoverStatus: "employer_only",
      employerTermCoverMinor: 50_00_000,
      healthCoverStatus: "both",
      dependantCount: 2
    });

    const [audit] = await testDb.db
      .select()
      .from(auditLog)
      .where(
        and(
          eq(auditLog.userId, "user-a"),
          eq(auditLog.action, "financial_profile.protection.upsert")
        )
      );
    expect(audit?.entityId).toBe(created.result.id);
  });

  it("never writes a cover amount or dependant detail into the audit log", async () => {
    const created = await service.upsertProtection(
      "user-audit",
      input({
        termCoverStatus: "independent",
        independentTermCoverMinor: 1_23_45_678,
        healthCoverStatus: "independent",
        independentHealthBaseCoverMinor: 9_87_654,
        dependantCount: 3
      }),
      key("cccccccc")
    );

    const rows = await testDb.db.select().from(auditLog).where(eq(auditLog.userId, "user-audit"));
    const serialized = JSON.stringify(rows);

    expect(rows).toHaveLength(1);
    expect(rows[0]?.entityId).toBe(created.result.id);
    expect(serialized).not.toContain("12345678");
    expect(serialized).not.toContain("987654");
    expect(rows[0]?.meta).toMatchObject({
      termCoverStatus: "independent",
      hasIndependentTermCover: true,
      hasEmployerTermCover: false
    });
    expect(Object.keys(rows[0]?.meta ?? {})).not.toContain("dependantCount");
  });

  it("selects the snapshot effective on the evaluated date, not the newest one", async () => {
    await service.upsertProtection(
      "user-b",
      input({
        effectiveFrom: new Date("2026-01-01T00:00:00.000Z"),
        termCoverStatus: "not_sure"
      }),
      key("bbbbbbb1")
    );
    await service.upsertProtection(
      "user-b",
      input({
        effectiveFrom: new Date("2026-06-01T00:00:00.000Z"),
        termCoverStatus: "independent",
        independentTermCoverMinor: 1_00_00_000
      }),
      key("bbbbbbb2")
    );

    const early = await service.getState("user-b", new Date("2026-03-01T00:00:00.000Z"));
    const late = await service.getState("user-b", new Date("2026-08-01T00:00:00.000Z"));

    expect(early.currentSnapshot?.termCoverStatus).toBe("not_sure");
    expect(early.termCover.state).toBe("unknown");
    expect(late.currentSnapshot?.termCoverStatus).toBe("independent");
    expect(late.termCover.state).toBe("complete");
  });

  it("keeps a future-dated snapshot out of the current answer but visible as upcoming", async () => {
    await service.upsertProtection(
      "user-future",
      input({ effectiveFrom: new Date("2026-01-01T00:00:00.000Z"), termCoverStatus: "none" }),
      key("dddddddd")
    );
    await service.upsertProtection(
      "user-future",
      input({
        effectiveFrom: new Date("2027-01-01T00:00:00.000Z"),
        termCoverStatus: "independent",
        independentTermCoverMinor: 2_00_00_000
      }),
      key("eeeeeeee")
    );

    const state = await service.getState("user-future", ASOF);

    expect(state.currentSnapshot?.termCoverStatus).toBe("none");
    expect(state.upcomingSnapshot?.termCoverStatus).toBe("independent");
    expect(state.limitations).toContain(
      "A future-dated protection snapshot exists and is not reflected above."
    );
  });

  it("rejects a second snapshot on the same effective date instead of overwriting history", async () => {
    await expect(
      service.upsertProtection(
        "user-a",
        // 17:30 IST on the same 1 April IST day as the snapshot above.
        input({
          effectiveFrom: new Date("2026-04-01T12:00:00.000Z"),
          termCoverStatus: "not_sure"
        }),
        key("ffffffff")
      )
    ).rejects.toThrow(DuplicateProtectionEffectiveDateError);

    const rows = await testDb.db
      .select()
      .from(protectionSnapshots)
      .where(eq(protectionSnapshots.userId, "user-a"));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.termCoverStatus).toBe("employer_only");
  });

  it("replays an identical request instead of appending a second snapshot", async () => {
    const body = input({
      effectiveFrom: new Date("2026-05-01T00:00:00.000Z"),
      termCoverStatus: "not_applicable",
      termNotApplicableReason: "no_financial_dependants"
    });
    const first = await service.upsertProtection("user-a", body, key("11111111"));
    const second = await service.upsertProtection("user-a", body, key("11111111"));

    expect(first.replayed).toBe(false);
    expect(second.replayed).toBe(true);
    expect(second.result.id).toBe(first.result.id);
  });

  it("produces exactly one snapshot under five concurrent identical requests", async () => {
    const body = input({ effectiveFrom: new Date("2026-07-01T00:00:00.000Z") });
    const results = await Promise.all(
      Array.from({ length: 5 }, () =>
        service.upsertProtection("user-concurrent", body, key("22222222"))
      )
    );

    const ids = new Set(results.map((result) => result.result.id));
    expect(ids.size).toBe(1);

    const rows = await testDb.db
      .select()
      .from(protectionSnapshots)
      .where(eq(protectionSnapshots.userId, "user-concurrent"));
    expect(rows).toHaveLength(1);

    const audits = await testDb.db
      .select()
      .from(auditLog)
      .where(eq(auditLog.userId, "user-concurrent"));
    expect(audits).toHaveLength(1);
  });

  it("never leaks one user's protection snapshots to another", async () => {
    const foreign = await service.getState("user-concurrent", ASOF);

    expect(foreign.currentSnapshot?.userId).toBe("user-concurrent");
    expect((await service.getState("user-b", ASOF)).currentSnapshot?.userId).toBe("user-b");
  });
});
