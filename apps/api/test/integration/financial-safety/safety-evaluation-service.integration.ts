import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { AccountRepository } from "../../../src/accounts/account.repository.js";
import { LiabilityAssetReadService } from "../../../src/assets/liability-asset-read.service.js";
import { AssetReserveCandidateReadService } from "../../../src/assets/asset-reserve-candidate-read.service.js";
import { AuditRepository } from "../../../src/audit/audit.repository.js";
import { CategoryRepository } from "../../../src/categories/category.repository.js";
import { withTxn } from "../../../src/common/db/db-txn.js";
import { IdempotencyPostgresRepository } from "../../../src/common/idempotency/idempotency-postgres.repository.js";
import { IdempotencyPostgresService } from "../../../src/common/idempotency/idempotency-postgres.service.js";
import { DeclaredDebtRepository } from "../../../src/financial-profiles/debt-profile.repository.js";
import { DebtProfileService } from "../../../src/financial-profiles/debt-profile.service.js";
import { FinancialProfileRepository } from "../../../src/financial-profiles/financial-profile.repository.js";
import { FinancialProfileService } from "../../../src/financial-profiles/financial-profile.service.js";
import { ProtectionRepository } from "../../../src/financial-profiles/protection.repository.js";
import { ProtectionService } from "../../../src/financial-profiles/protection.service.js";
import { EssentialBurnRepository } from "../../../src/financial-safety/essential-burn.repository.js";
import { EssentialBurnService } from "../../../src/financial-safety/essential-burn.service.js";
import { ReserveSourceRepository } from "../../../src/financial-safety/reserve-source.repository.js";
import { ReserveSourceService } from "../../../src/financial-safety/reserve-source.service.js";
import { ReserveValueService } from "../../../src/financial-safety/reserve-value.service.js";
import { SafetyEvaluationRepository } from "../../../src/financial-safety/safety-evaluation.repository.js";
import { SafetyEvaluationService } from "../../../src/financial-safety/safety-evaluation.service.js";
import { ForecastingRepository } from "../../../src/insights/forecasting/forecasting.repository.js";
import { SafetyBufferRepository } from "../../../src/safety-buffer/safety-buffer.repository.js";
import { SafetyBufferService } from "../../../src/safety-buffer/safety-buffer.service.js";
import { TransactionRepository } from "../../../src/transactions/transaction.repository.js";
import { TransactionService } from "../../../src/transactions/transaction.service.js";
import { assertLedgerInvariants } from "../support/assert-ledger-invariants.js";
import { createTestDb, insertTestUser } from "../support/postgres-test-db.js";
import type { TestDb } from "../support/postgres-test-db.js";

/**
 * Full-composition integration coverage for SafetyEvaluationService against
 * a real ledger, protection profile, and salary/work profile -- complementing
 * `safety-evaluation.integration.ts`'s repository-focused persistence tests
 * with the actual Essential Burn / Reserve Value / protection composition.
 */

const USER_A = "safety-eval-service-user-a";
const USER_B = "safety-eval-service-user-b";
const ASOF = new Date("2026-08-18T10:00:00.000Z");

const dummyLogger = {
  log: () => {},
  info: () => {},
  error: () => {},
  warn: () => {},
  debug: () => {}
};

describe("SafetyEvaluationService integration", () => {
  let testDb: TestDb;
  let service: SafetyEvaluationService;
  let repository: SafetyEvaluationRepository;
  let accountRepo: AccountRepository;
  let categoryRepo: CategoryRepository;
  let transactionService: TransactionService;
  let profileService: FinancialProfileService;
  let protectionService: ProtectionService;
  let reserveSourceService: ReserveSourceService;

  async function seedFullyConfiguredUser(userId: string, accountName: string): Promise<void> {
    await profileService.updateProfile(
      userId,
      {
        monthlyWorkMinutes: 9_600,
        incomeStability: "stable",
        salaryCreditDay: 1,
        expectedAnnualIncrementBps: null
      },
      randomUUID()
    );
    await profileService.addSalaryVersion(
      userId,
      {
        netMonthlySalaryMinor: 1_00_00_000,
        annualCtcMinor: 12_00_00_000,
        effectiveFrom: new Date("2026-04-01T00:00:00.000Z")
      },
      randomUUID()
    );

    const account = await withTxn(testDb.db, (tx) =>
      accountRepo.create(
        userId,
        { name: accountName, type: "bank", openingBalanceMinor: 45_00_000 },
        tx
      )
    );

    // A reserve source must be explicitly classified -- an account balance
    // alone is never eligible emergency liquidity (implementation-contract.md).
    await reserveSourceService.updateSource(
      userId,
      "account",
      account.id,
      { liquidityTier: "instant", isIncluded: true },
      randomUUID()
    );

    const essentialCategory = await categoryRepo.create(userId, {
      name: "Groceries",
      kind: "expense",
      group: "essential"
    });

    for (const month of ["2026-05", "2026-06", "2026-07"]) {
      await transactionService.create(
        userId,
        {
          accountId: account.id,
          categoryId: essentialCategory.id,
          type: "expense",
          amountMinor: 1_00_000,
          occurredAt: new Date(`${month}-15T12:00:00.000Z`),
          description: `Groceries ${month}`,
          tags: []
        },
        randomUUID()
      );
    }

    await protectionService.upsertProtection(
      userId,
      {
        effectiveFrom: new Date("2026-04-01T00:00:00.000Z"),
        termCoverStatus: "independent",
        independentTermCoverMinor: 1_20_00_00_000,
        employerTermCoverMinor: null,
        independentTermExpiresOn: new Date("2050-01-01T00:00:00.000Z"),
        termNotApplicableReason: null,
        healthCoverStatus: "independent",
        independentHealthBaseCoverMinor: 15_00_000,
        independentHealthSuperTopUpMinor: null,
        employerHealthCoverMinor: null,
        independentHealthExpiresOn: new Date("2050-01-01T00:00:00.000Z"),
        dependantCount: 1
      },
      randomUUID()
    );
  }

  beforeAll(async () => {
    testDb = await createTestDb();
    const db = testDb.db;

    await insertTestUser(db, USER_A);
    await insertTestUser(db, USER_B);

    const audit = new AuditRepository(db);
    const idempotency = new IdempotencyPostgresService(db, new IdempotencyPostgresRepository(db));

    accountRepo = new AccountRepository(db);
    categoryRepo = new CategoryRepository(db);
    const transactionRepo = new TransactionRepository(db);
    transactionService = new TransactionService(
      db,
      accountRepo,
      categoryRepo,
      transactionRepo,
      audit,
      dummyLogger
    );

    const profileRepo = new FinancialProfileRepository(db);
    profileService = new FinancialProfileService(profileRepo, audit, idempotency);

    const protectionRepo = new ProtectionRepository(db);
    protectionService = new ProtectionService(protectionRepo, audit, idempotency);

    const liabilityAssetRead = new LiabilityAssetReadService(db);
    const debtRepo = new DeclaredDebtRepository(db);
    const debtService = new DebtProfileService(debtRepo, liabilityAssetRead, audit, idempotency);

    const forecastingRepo = new ForecastingRepository(db);
    const safetyBufferRepo = new SafetyBufferRepository(db);
    const safetyBufferService = new SafetyBufferService(
      db,
      safetyBufferRepo,
      audit,
      accountRepo,
      forecastingRepo,
      idempotency
    );

    const essentialBurnService = new EssentialBurnService(
      dummyLogger,
      new EssentialBurnRepository(db)
    );
    const reserveSourceRepo = new ReserveSourceRepository(db);
    const assetReserveCandidates = new AssetReserveCandidateReadService(db);
    const reserveValueService = new ReserveValueService(
      dummyLogger,
      reserveSourceRepo,
      accountRepo,
      assetReserveCandidates
    );
    reserveSourceService = new ReserveSourceService(
      reserveSourceRepo,
      audit,
      accountRepo,
      assetReserveCandidates,
      idempotency
    );

    repository = new SafetyEvaluationRepository(db);
    service = new SafetyEvaluationService(
      dummyLogger,
      essentialBurnService,
      reserveValueService,
      protectionService,
      profileService,
      debtService,
      safetyBufferService,
      repository,
      idempotency
    );

    await seedFullyConfiguredUser(USER_A, "HDFC Primary A");
    await seedFullyConfiguredUser(USER_B, "HDFC Primary B");
  }, 60_000);

  afterAll(async () => {
    await assertLedgerInvariants(testDb.db);
    await testDb.teardown();
  });

  it("returns a live evaluation with no persisted history yet", async () => {
    const evaluation = await service.getEvaluation(USER_A, ASOF);
    expect(evaluation.evaluationId).toBeNull();
    expect(evaluation.snapshotStatus).toBe("live");
    expect(evaluation.runway.availability).toBe("available");
    expect(evaluation.runway.tier).toBe("fortified");
  });

  it("persists one immutable evaluation on refresh, and GET then matches it", async () => {
    const refreshed = await service.refresh(USER_A, randomUUID(), ASOF);
    expect(refreshed.replayed).toBe(false);
    expect(refreshed.result.evaluationId).not.toBeNull();
    expect(refreshed.result.snapshotStatus).toBe("persisted");

    const fetched = await service.getEvaluation(USER_A, ASOF);
    expect(fetched.evaluationId).toBe(refreshed.result.evaluationId);
    expect(fetched.snapshotStatus).toBe("persisted");
  });

  it("returns the same evaluation for a duplicate refresh under a different Idempotency-Key (fingerprint dedup)", async () => {
    const first = await service.refresh(USER_A, randomUUID(), ASOF);
    const second = await service.refresh(USER_A, randomUUID(), ASOF);
    expect(second.result.evaluationId).toBe(first.result.evaluationId);
  });

  it("replays the exact result for a repeated Idempotency-Key", async () => {
    const key = randomUUID();
    const first = await service.refresh(USER_A, key, ASOF);
    const second = await service.refresh(USER_A, key, ASOF);
    expect(second.replayed).toBe(true);
    expect(second.result.evaluationId).toBe(first.result.evaluationId);
  });

  it("converges five concurrent identical refreshes on exactly one persisted evaluation", async () => {
    const attempts = await Promise.all(
      Array.from({ length: 5 }, () => service.refresh(USER_A, randomUUID(), ASOF))
    );
    const evaluationIds = new Set(attempts.map((a) => a.result.evaluationId));
    expect(evaluationIds.size).toBe(1);
  });

  it("isolates evaluations by tenant", async () => {
    const evalA = await service.getEvaluation(USER_A, ASOF);
    const evalB = await service.getEvaluation(USER_B, ASOF);
    expect(evalA.evaluationId).not.toBe(evalB.evaluationId);

    const crossTenantLookup = await repository.findByFingerprint(
      USER_B,
      evalA.inputFingerprint,
      evalA.formulaVersion,
      evalA.policyVersion
    );
    expect(crossTenantLookup).toBeNull();
  });
});
