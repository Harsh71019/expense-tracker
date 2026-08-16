import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";

import { AccountRepository } from "../../../src/accounts/account.repository.js";
import { AuditRepository } from "../../../src/audit/audit.repository.js";
import { withTxn } from "../../../src/common/db/db-txn.js";
import {
  cashflowForecastSnapshots,
  safetyBufferPreferences
} from "../../../src/common/db/schema/index.js";
import { IdempotencyPostgresRepository } from "../../../src/common/idempotency/idempotency-postgres.repository.js";
import { IdempotencyPostgresService } from "../../../src/common/idempotency/idempotency-postgres.service.js";
import { GoalRepository } from "../../../src/goals/goal.repository.js";
import { GoalService } from "../../../src/goals/goal.service.js";
import { ForecastingRepository } from "../../../src/insights/forecasting/forecasting.repository.js";
import { ForecastingService } from "../../../src/insights/forecasting/forecasting.service.js";
import { SafetyBufferRepository } from "../../../src/safety-buffer/safety-buffer.repository.js";
import { SafetyBufferService } from "../../../src/safety-buffer/safety-buffer.service.js";
import { assertLedgerInvariants } from "../support/assert-ledger-invariants.js";
import { createTestDb, insertTestUser } from "../support/postgres-test-db.js";
import type { TestDb } from "../support/postgres-test-db.js";

describe("Goal Feasibility and Safety Buffer Integration", () => {
  let testDb: TestDb;
  let accounts: AccountRepository;
  let goals: GoalRepository;
  let safetyBufferRepo: SafetyBufferRepository;
  let safetyBufferService: SafetyBufferService;
  let forecastingRepo: ForecastingRepository;
  let forecastingService: ForecastingService;
  let goalService: GoalService;
  let idempotency: IdempotencyPostgresService;

  const userA = "user-feasibility-a";
  const userB = "user-feasibility-b";
  const userC = "user-feasibility-c";

  beforeAll(async () => {
    testDb = await createTestDb();
    await insertTestUser(testDb.db, userA);
    await insertTestUser(testDb.db, userB);
    await insertTestUser(testDb.db, userC);

    process.env.DATABASE_URL = testDb.connectionUri;
    process.env.REDIS_URL = "redis://127.0.0.1:6379/12";
    process.env.TRUSTED_ORIGINS = "http://localhost:3000";
    process.env.BETTER_AUTH_SECRET = "test-secret-long-enough-32-chars-long";
    process.env.BETTER_AUTH_URL = "http://localhost:4000";

    accounts = new AccountRepository(testDb.db);
    goals = new GoalRepository(testDb.db);
    const audit = new AuditRepository(testDb.db);
    idempotency = new IdempotencyPostgresService(
      testDb.db,
      new IdempotencyPostgresRepository(testDb.db)
    );
    forecastingRepo = new ForecastingRepository(testDb.db);
    forecastingService = new ForecastingService(forecastingRepo);
    safetyBufferRepo = new SafetyBufferRepository(testDb.db);
    safetyBufferService = new SafetyBufferService(
      testDb.db,
      safetyBufferRepo,
      audit,
      accounts,
      forecastingRepo,
      idempotency
    );
    goalService = new GoalService(
      testDb.db,
      goals,
      accounts,
      audit,
      forecastingService,
      safetyBufferService
    );
  }, 60_000);

  afterEach(async () => {
    await assertLedgerInvariants(testDb.db);
  });

  afterAll(async () => {
    await testDb.teardown();
  });

  it("versions safety buffer preferences append-only and isolates across tenants", async () => {
    const v1 = await safetyBufferService.createVersion(userA, {
      mode: "fixed_amount",
      amountMinor: 5_000_000,
      effectiveFrom: new Date("2026-01-01T00:00:00.000Z")
    });

    const v2 = await safetyBufferService.createVersion(userA, {
      mode: "essential_months",
      months: 3,
      effectiveFrom: new Date("2026-06-01T00:00:00.000Z")
    });

    expect(v1.result.version).toBe(1);
    expect(v2.result.version).toBe(2);

    // As of March 2026, version 1 is effective
    const marchEffective = await safetyBufferService.getEffective(
      userA,
      new Date("2026-03-01T00:00:00.000Z")
    );
    expect(marchEffective?.version).toBe(1);

    // As of July 2026, version 2 is effective
    const julyEffective = await safetyBufferService.getEffective(
      userA,
      new Date("2026-07-01T00:00:00.000Z")
    );
    expect(julyEffective?.version).toBe(2);

    // User B has no preferences -> returns null (fallback)
    const userBEffective = await safetyBufferService.getEffective(userB);
    expect(userBEffective).toBeNull();
  });

  it("excludes investment accounts and credit cards from liquid balance", async () => {
    await withTxn(testDb.db, async (tx) => {
      await accounts.create(
        userA,
        { name: "Savings", type: "bank", openingBalanceMinor: 3_000_000 },
        tx
      );
      await accounts.create(
        userA,
        { name: "Cash", type: "cash", openingBalanceMinor: 2_000_000 },
        tx
      );
      await accounts.create(
        userA,
        { name: "Mutual Funds", type: "investment", openingBalanceMinor: 50_000_000 },
        tx
      );
      await accounts.create(
        userA,
        { name: "Credit Card", type: "credit_card", openingBalanceMinor: -1_500_000 },
        tx
      );
    });

    const state = await safetyBufferService.getState(userA);

    // Liquid balance should be Savings (30,000) + Cash (20,000) = 50,000 INR (5,000,000 paise)
    // Investments (500,000 INR) and Credit Card (-15,000 INR) must NOT be counted in liquid cash.
    expect(state.liquidBalanceMinor).toBe(5_000_000);
  });

  it("evaluates feasibility report across Priority, Target Date, and Proportional scenarios", async () => {
    const asOf = new Date("2026-08-01T00:00:00.000Z");

    await withTxn(testDb.db, async (tx) => {
      await accounts.create(
        userC,
        { name: "Savings", type: "bank", openingBalanceMinor: 10_000_000 },
        tx
      );
    });

    await safetyBufferService.createVersion(userC, {
      mode: "fixed_amount",
      amountMinor: 5_000_000,
      effectiveFrom: asOf
    });

    // Insert a valid 30-day forecast snapshot directly for testing
    await testDb.db.insert(cashflowForecastSnapshots).values({
      userId: userC,
      horizonDays: 30,
      modelVersion: 1,
      asOf,
      inputDigest: "a".repeat(64),
      inputWatermark: {
        asOf,
        latestOccurredAt: asOf,
        latestUpdatedAt: asOf,
        rowCount: 100,
        digest: "a".repeat(64)
      },
      sufficiency: {
        status: "sufficient",
        observationCount: 90,
        minimumRequired: 30
      },
      resources: {
        rowsScanned: 100,
        runtimeMs: 10,
        rowBudgetHit: false,
        timedOut: false,
        outcome: { status: "completed" }
      },
      model: "trailing_median",
      pointBalanceMinor: 12_000_000, // 120,000 INR
      range: {
        lowerMinor: 12_000_000, // 120,000 INR conservative month end
        upperMinor: 14_000_000,
        observedCoverageBps: 8000,
        label: "historical_range"
      },
      assumptions: {
        liquidBalanceMinor: 10_000_000, // conservative surplus = 120,000 - 100,000 = 20,000 INR / mo
        knownRecurringInflowMinor: 10_000_000,
        knownRecurringOutflowMinor: 4_000_000,
        creditCardBillsDueMinor: 1_000_000,
        excludedCreditCardPurchaseCount: 5,
        excludedTransferCount: 1,
        variableSpendExcludedRecurringCount: 3,
        asOfDeterministic: true
      },
      metrics: {
        evaluatedOriginCount: 10,
        maeMinor: 100_000,
        maseBps: 8000,
        baselineMaeMinor: 120_000,
        residualCount: 30,
        observedCoverageBps: 8000,
        eligibleForHorizon: true
      },
      shortfall: {
        hasPotentialShortfall: false,
        firstPotentialShortfallDate: null,
        conservativeBalanceMinor: 12_000_000,
        mode: "read_only"
      },
      computedAt: asOf
    });

    // Create 2 goals:
    // Goal 1: Emergency Fund (target 60,000 INR, target date 2 months away -> 30,000 INR/mo)
    // Goal 2: Laptop (target 40,000 INR, target date 4 months away -> 10,000 INR/mo)
    await withTxn(testDb.db, async (tx) => {
      await goalService.createInTx(
        userC,
        {
          name: "Emergency Fund",
          targetMinor: 6_000_000,
          targetDate: new Date("2026-10-01T00:00:00.000Z"),
          fundingMode: "manual_envelope"
        },
        tx
      );
      await goalService.createInTx(
        userC,
        {
          name: "Laptop",
          targetMinor: 4_000_000,
          targetDate: new Date("2026-12-01T00:00:00.000Z"),
          fundingMode: "manual_envelope"
        },
        tx
      );
    });

    const report = await goalService.getFeasibilityReport(userC, asOf);

    expect(report.isForecastSufficient).toBe(true);
    expect(report.isForecastStale).toBe(false);
    expect(report.conservativeAvailableMonthlyMinor).toBe(2_000_000); // 20,000 INR
    expect(report.scenarios).toHaveLength(3);

    const priorityScenario = report.scenarios.find((s) => s.scenarioType === "priority_order");
    expect(priorityScenario).toBeDefined();
    // In Priority scenario: Priority 0 (Emergency Fund) gets full 20,000 INR available, Priority 1 gets 0
    expect(priorityScenario?.allocations[0]?.allocatedMonthlyMinor).toBe(2_000_000);
    expect(priorityScenario?.allocations[1]?.allocatedMonthlyMinor).toBe(0);

    const proportionalScenario = report.scenarios.find((s) => s.scenarioType === "proportional");
    expect(proportionalScenario).toBeDefined();
    // In Proportional: Emergency (60%) gets 12,000 INR, Laptop (40%) gets 8,000 INR
    expect(proportionalScenario?.allocations[0]?.allocatedMonthlyMinor).toBe(1_200_000);
    expect(proportionalScenario?.allocations[1]?.allocatedMonthlyMinor).toBe(800_000);
    expect(proportionalScenario?.totalAllocatedMonthlyMinor).toBe(2_000_000);
  });

  it("safely handles 5 parallel concurrent requests with identical idempotency key", async () => {
    const key = "33333333-3333-4333-8333-333333333333";
    const attempts = await Promise.all(
      Array.from({ length: 5 }, () =>
        safetyBufferService.createVersion(
          userB,
          {
            mode: "fixed_amount",
            amountMinor: 10_000_000
          },
          key
        )
      )
    );

    const results = attempts.map((a) => a.result);
    // All 5 attempts should return the exact same version ID
    const firstId = results[0]?.id;
    for (const r of results) {
      expect(r.id).toBe(firstId);
    }

    // Exactly 1 row should be in the database
    const rows = await testDb.db
      .select()
      .from(safetyBufferPreferences)
      .where(eq(safetyBufferPreferences.userId, userB));

    expect(rows).toHaveLength(1);
    expect(rows[0]?.version).toBe(1);
  });
});
