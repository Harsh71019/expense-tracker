import type { SafetyEvaluation } from "@treasury-ops/shared";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { withTxn } from "../../../src/common/db/db-txn.js";
import { financialSafetyEvaluations } from "../../../src/common/db/schema/index.js";
import { SafetyEvaluationRepository } from "../../../src/financial-safety/safety-evaluation.repository.js";
import { assertLedgerInvariants } from "../support/assert-ledger-invariants.js";
import { createTestDb, insertTestUser } from "../support/postgres-test-db.js";
import type { TestDb } from "../support/postgres-test-db.js";

const USER_A = "safety-evaluation-user-a";
const USER_B = "safety-evaluation-user-b";

const ASOF = new Date("2026-08-18T00:00:00.000Z");
const SOURCE_THROUGH = new Date("2026-08-01T00:00:00.000Z");
const COMPUTED_AT = new Date("2026-08-18T00:05:00.000Z");

function evaluationFixture(overrides: Partial<SafetyEvaluation> = {}): SafetyEvaluation {
  return {
    evaluationId: null,
    snapshotStatus: "persisted",
    computedAt: COMPUTED_AT,
    asOf: ASOF,
    sourceThrough: SOURCE_THROUGH,
    formulaVersion: 1,
    policyVersion: 1,
    inputFingerprint: "fingerprint-a",
    quality: "complete",
    currentStage: "building_fortress",
    nextAction: "none",
    runway: {
      availability: "available",
      unavailableReason: null,
      tier: "healthy",
      runwayBasisPoints: 40_000,
      runwayDays: 120,
      eligibleReserveMinor: 4_00_000,
      essentialBurnMinor: 1_00_000,
      observedCompleteMonthCount: 3,
      policyDaysPerMonth: 30,
      criticalThresholdBasisPoints: 30_000,
      fortifiedThresholdBasisPoints: 60_000
    },
    target: {
      policyTargetMinor: 6_00_000,
      userTargetMinor: null,
      effectiveTargetMinor: 6_00_000,
      targetSource: "policy",
      targetMonths: 6,
      currentGapMinor: 2_00_000,
      currentSurplusMinor: 0
    },
    checks: [],
    limitations: [],
    essentialBurnEvidence: {
      averageMonthlyEssentialMinor: 1_00_000,
      observedCompleteMonthCount: 3,
      quality: "complete"
    },
    reserveEvidence: {
      totalEligibleMinor: 4_00_000,
      instantMinor: 4_00_000,
      tPlusOneMinor: 0,
      lockedMinor: 0,
      staleExcludedMinor: 0,
      currentlyEligibleSourceCount: 1,
      configuredSourceCount: 1
    },
    protectionEvidence: {
      termCoverState: "complete",
      healthCoverState: "complete",
      incomeBasis: "annual_ctc",
      incomeBasisQuality: "confirmed",
      termBenchmarkMinor: 1_00_00_000,
      healthBenchmarkMinor: 15_00_000_00
    },
    debtEvidence: {
      activeDebtCount: 0,
      highCostDebtCount: 0
    },
    ...overrides
  };
}

describe("safety evaluation persistence", () => {
  let testDb: TestDb;
  let repository: SafetyEvaluationRepository;

  beforeAll(async () => {
    testDb = await createTestDb();
    await insertTestUser(testDb.db, USER_A);
    await insertTestUser(testDb.db, USER_B);
    repository = new SafetyEvaluationRepository(testDb.db);
  });

  afterAll(async () => {
    await assertLedgerInvariants(testDb.db);
    await testDb.teardown();
  });

  it("inserts one row and re-parses resultJson through the shared schema on read", async () => {
    const evaluation = evaluationFixture({ inputFingerprint: "read-back" });
    const stored = await withTxn(testDb.db, (tx) =>
      repository.insertIfAbsent(
        USER_A,
        {
          inputFingerprint: evaluation.inputFingerprint,
          formulaVersion: evaluation.formulaVersion,
          policyVersion: evaluation.policyVersion,
          asOf: evaluation.asOf,
          sourceThrough: evaluation.sourceThrough,
          resultJson: evaluation,
          createdAt: evaluation.computedAt
        },
        tx
      )
    );

    expect(stored.evaluation.currentStage).toBe("building_fortress");
    expect(stored.evaluation.runway.runwayBasisPoints).toBe(40_000);

    const found = await repository.findByFingerprint(USER_A, "read-back", 1, 1);
    expect(found).not.toBeNull();
    expect(found?.id).toBe(stored.id);
    expect(found?.evaluation.evaluationId).toBeNull(); // stored resultJson always carries a null id -- the repository/service attach it on read
  });

  it("returns the existing row instead of a duplicate for an identical fingerprint (unique identity)", async () => {
    const evaluation = evaluationFixture({ inputFingerprint: "duplicate-fingerprint" });
    const input = {
      inputFingerprint: evaluation.inputFingerprint,
      formulaVersion: evaluation.formulaVersion,
      policyVersion: evaluation.policyVersion,
      asOf: evaluation.asOf,
      sourceThrough: evaluation.sourceThrough,
      resultJson: evaluation,
      createdAt: evaluation.computedAt
    };

    const first = await withTxn(testDb.db, (tx) => repository.insertIfAbsent(USER_A, input, tx));
    const second = await withTxn(testDb.db, (tx) => repository.insertIfAbsent(USER_A, input, tx));

    expect(second.id).toBe(first.id);

    const rows = await testDb.db
      .select({ id: financialSafetyEvaluations.id })
      .from(financialSafetyEvaluations)
      .where(sql`${financialSafetyEvaluations.inputFingerprint} = 'duplicate-fingerprint'`);
    expect(rows).toHaveLength(1);
  });

  it("converges five concurrent identical refreshes on exactly one row", async () => {
    const evaluation = evaluationFixture({ inputFingerprint: "concurrent-fingerprint" });
    const input = {
      inputFingerprint: evaluation.inputFingerprint,
      formulaVersion: evaluation.formulaVersion,
      policyVersion: evaluation.policyVersion,
      asOf: evaluation.asOf,
      sourceThrough: evaluation.sourceThrough,
      resultJson: evaluation,
      createdAt: evaluation.computedAt
    };

    const results = await Promise.all(
      Array.from({ length: 5 }, () =>
        withTxn(testDb.db, (tx) => repository.insertIfAbsent(USER_A, input, tx))
      )
    );

    const uniqueIds = new Set(results.map((result) => result.id));
    expect(uniqueIds.size).toBe(1);

    const rows = await testDb.db
      .select({ id: financialSafetyEvaluations.id })
      .from(financialSafetyEvaluations)
      .where(sql`${financialSafetyEvaluations.inputFingerprint} = 'concurrent-fingerprint'`);
    expect(rows).toHaveLength(1);
  });

  it("keys identity by policy/formula version too -- a policy bump produces a second row", async () => {
    const evaluation = evaluationFixture({ inputFingerprint: "same-facts-different-policy" });
    const v1 = {
      inputFingerprint: evaluation.inputFingerprint,
      formulaVersion: 1,
      policyVersion: 1,
      asOf: evaluation.asOf,
      sourceThrough: evaluation.sourceThrough,
      resultJson: evaluation,
      createdAt: evaluation.computedAt
    };
    const v2 = { ...v1, policyVersion: 2, resultJson: { ...evaluation, policyVersion: 2 } };

    const first = await withTxn(testDb.db, (tx) => repository.insertIfAbsent(USER_A, v1, tx));
    const second = await withTxn(testDb.db, (tx) => repository.insertIfAbsent(USER_A, v2, tx));

    expect(second.id).not.toBe(first.id);
    const bothVersions = await repository.findByFingerprint(
      USER_A,
      "same-facts-different-policy",
      1,
      2
    );
    expect(bothVersions?.id).toBe(second.id);
  });

  it("never leaks a row across tenants", async () => {
    const evaluation = evaluationFixture({ inputFingerprint: "tenant-isolated" });
    const input = {
      inputFingerprint: evaluation.inputFingerprint,
      formulaVersion: evaluation.formulaVersion,
      policyVersion: evaluation.policyVersion,
      asOf: evaluation.asOf,
      sourceThrough: evaluation.sourceThrough,
      resultJson: evaluation,
      createdAt: evaluation.computedAt
    };

    await withTxn(testDb.db, (tx) => repository.insertIfAbsent(USER_A, input, tx));

    const forOtherUser = await repository.findByFingerprint(USER_B, "tenant-isolated", 1, 1);
    expect(forOtherUser).toBeNull();

    const mostRecentForOtherUser = await repository.findMostRecent(USER_B);
    expect(mostRecentForOtherUser?.evaluation.inputFingerprint).not.toBe("tenant-isolated");
  });

  it("throws when a persisted row's resultJson fails shared-schema validation on read", async () => {
    await testDb.db.insert(financialSafetyEvaluations).values({
      userId: USER_A,
      inputFingerprint: "corrupt-row",
      formulaVersion: 1,
      policyVersion: 1,
      asOf: ASOF,
      sourceThrough: SOURCE_THROUGH,
      resultJson: { not: "a valid safety evaluation" },
      createdAt: COMPUTED_AT
    });

    await expect(repository.findByFingerprint(USER_A, "corrupt-row", 1, 1)).rejects.toThrow();
  });
});
