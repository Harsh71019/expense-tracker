import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { AccountRepository } from "../../../src/accounts/account.repository.js";
import { AccountService } from "../../../src/accounts/account.service.js";
import { AccountDiagnosticReadService } from "../../../src/accounts/account-diagnostic-read.service.js";
import { AssetDiagnosticReadService } from "../../../src/assets/asset-diagnostic-read.service.js";
import { AuditRepository } from "../../../src/audit/audit.repository.js";
import { CategoryRepository } from "../../../src/categories/category.repository.js";
import { CategoryDiagnosticReadService } from "../../../src/categories/category-diagnostic-read.service.js";
import { IdempotencyPostgresRepository } from "../../../src/common/idempotency/idempotency-postgres.repository.js";
import { IdempotencyPostgresService } from "../../../src/common/idempotency/idempotency-postgres.service.js";
import { FinancialDiagnosticService } from "../../../src/financial-diagnostic/financial-diagnostic.service.js";
import { DeclaredDebtRepository } from "../../../src/financial-profiles/debt-profile.repository.js";
import { DebtProfileService } from "../../../src/financial-profiles/debt-profile.service.js";
import { FinancialProfileRepository } from "../../../src/financial-profiles/financial-profile.repository.js";
import { FinancialProfileService } from "../../../src/financial-profiles/financial-profile.service.js";
import { ProtectionRepository } from "../../../src/financial-profiles/protection.repository.js";
import { ProtectionService } from "../../../src/financial-profiles/protection.service.js";
import { GoalDiagnosticReadService } from "../../../src/goals/goal-diagnostic-read.service.js";
import { ForecastingRepository } from "../../../src/insights/forecasting/forecasting.repository.js";
import { LiabilityAssetReadService } from "../../../src/assets/liability-asset-read.service.js";
import { SafetyBufferRepository } from "../../../src/safety-buffer/safety-buffer.repository.js";
import { SafetyBufferService } from "../../../src/safety-buffer/safety-buffer.service.js";
import { LedgerHistoryDiagnosticReadService } from "../../../src/transactions/ledger-history-diagnostic-read.service.js";
import { TransactionRepository } from "../../../src/transactions/transaction.repository.js";
import { TransactionService } from "../../../src/transactions/transaction.service.js";
import { assertLedgerInvariants } from "../support/assert-ledger-invariants.js";
import { createTestDb, insertTestUser } from "../support/postgres-test-db.js";
import type { TestDb } from "../support/postgres-test-db.js";

const ASOF = new Date("2026-08-18T10:00:00.000Z");

describe("FinancialDiagnosticService Integration", () => {
  let testDb: TestDb;
  let service: FinancialDiagnosticService;
  let profileService: FinancialProfileService;
  let accountService: AccountService;
  let categoryRepo: CategoryRepository;
  let transactionService: TransactionService;
  let protectionService: ProtectionService;
  let safetyBufferService: SafetyBufferService;

  const dummyLogger = {
    log: () => {},
    info: () => {},
    error: () => {},
    warn: () => {},
    debug: () => {}
  };

  beforeAll(async () => {
    testDb = await createTestDb();
    const db = testDb.db;

    const audit = new AuditRepository(db);
    const idempotency = new IdempotencyPostgresService(db, new IdempotencyPostgresRepository(db));

    const accountRepo = new AccountRepository(db);
    accountService = new AccountService(db, accountRepo);
    const accountDiagnostic = new AccountDiagnosticReadService(db);

    categoryRepo = new CategoryRepository(db);
    const categoryDiagnostic = new CategoryDiagnosticReadService(db);

    const transactionRepo = new TransactionRepository(db);
    transactionService = new TransactionService(
      db,
      accountRepo,
      categoryRepo,
      transactionRepo,
      audit,
      dummyLogger
    );
    const ledgerDiagnostic = new LedgerHistoryDiagnosticReadService(db);

    const assetDiagnostic = new AssetDiagnosticReadService(db);
    const liabilityAssetRead = new LiabilityAssetReadService(db);

    const goalDiagnostic = new GoalDiagnosticReadService(db);

    const profileRepo = new FinancialProfileRepository(db);
    profileService = new FinancialProfileService(profileRepo, audit, idempotency);

    const protectionRepo = new ProtectionRepository(db);
    protectionService = new ProtectionService(protectionRepo, audit, idempotency);

    const debtRepo = new DeclaredDebtRepository(db);
    const debtService = new DebtProfileService(debtRepo, liabilityAssetRead, audit, idempotency);

    const forecastingRepo = new ForecastingRepository(db);
    const safetyBufferRepo = new SafetyBufferRepository(db);
    safetyBufferService = new SafetyBufferService(
      db,
      safetyBufferRepo,
      audit,
      accountRepo,
      forecastingRepo,
      idempotency
    );

    service = new FinancialDiagnosticService(
      dummyLogger,
      accountDiagnostic,
      categoryDiagnostic,
      ledgerDiagnostic,
      assetDiagnostic,
      goalDiagnostic,
      profileService,
      protectionService,
      debtService,
      safetyBufferService
    );

    for (const userId of ["user-a", "user-b", "user-cold"]) {
      await insertTestUser(db, userId);
    }
  }, 60_000);

  afterAll(async () => {
    await assertLedgerInvariants(testDb.db);
    await testDb.teardown();
  });

  it("returns cold-start diagnostic for an unconfigured user", async () => {
    const diagnostic = await service.getDiagnostic("user-cold", ASOF);

    expect(diagnostic.overallStatus).toBe("setup_required");
    expect(diagnostic.nextAction).toBe("configure_salary");
    expect(diagnostic.readyCount).toBe(0);
    expect(diagnostic.totalRequiredCount).toBe(6);
    expect(diagnostic.items.length).toBe(11);

    const salaryItem = diagnostic.items.find((i) => i.key === "salary");
    expect(salaryItem?.status).toBe("missing");
    expect(salaryItem?.attention).toBe("blocking");

    const accountsItem = diagnostic.items.find((i) => i.key === "accounts");
    expect(accountsItem?.status).toBe("missing");
  });

  it("maintains tenant isolation and progresses through readiness as facts are added", async () => {
    // 1. Configure salary for User A
    await profileService.updateProfile(
      "user-a",
      {
        monthlyWorkMinutes: 9600,
        incomeStability: "stable",
        salaryCreditDay: 1,
        expectedAnnualIncrementBps: null
      },
      "11111111-aaaa-4111-8111-111111111111"
    );
    await profileService.addSalaryVersion(
      "user-a",
      {
        netMonthlySalaryMinor: 15_00_000,
        annualCtcMinor: null,
        effectiveFrom: new Date("2026-04-01T00:00:00.000Z")
      },
      "22222222-aaaa-4111-8111-222222222222"
    );

    // 2. Add bank account for User A
    const accountA = await accountService.create("user-a", {
      name: "HDFC Primary",
      type: "bank",
      openingBalanceMinor: 200_000
    });

    // 3. Add essential category for User A
    const essentialCategory = await categoryRepo.create("user-a", {
      name: "Groceries",
      kind: "expense",
      group: "essential"
    });

    // 4. Add qualifying posted essential expense transactions across complete months
    // Month 2026-05
    await transactionService.create(
      "user-a",
      {
        accountId: accountA.id,
        categoryId: essentialCategory.id,
        type: "expense",
        amountMinor: 5_000,
        occurredAt: new Date("2026-05-15T12:00:00.000Z"),
        description: "Supermarket May",
        tags: []
      },
      "33333333-aaaa-4111-8111-333333333333"
    );

    // Month 2026-06
    await transactionService.create(
      "user-a",
      {
        accountId: accountA.id,
        categoryId: essentialCategory.id,
        type: "expense",
        amountMinor: 6_000,
        occurredAt: new Date("2026-06-15T12:00:00.000Z"),
        description: "Supermarket June",
        tags: []
      },
      "44444444-aaaa-4111-8111-444444444444"
    );

    // Month 2026-07
    await transactionService.create(
      "user-a",
      {
        accountId: accountA.id,
        categoryId: essentialCategory.id,
        type: "expense",
        amountMinor: 7_000,
        occurredAt: new Date("2026-07-15T12:00:00.000Z"),
        description: "Supermarket July",
        tags: []
      },
      "55555555-aaaa-4111-8111-555555555555"
    );

    // Month 2026-08 (current partial month)
    await transactionService.create(
      "user-a",
      {
        accountId: accountA.id,
        categoryId: essentialCategory.id,
        type: "expense",
        amountMinor: 4_000,
        occurredAt: new Date("2026-08-05T12:00:00.000Z"),
        description: "Supermarket August (partial)",
        tags: []
      },
      "66666666-aaaa-4111-8111-666666666666"
    );

    // 5. Add protection snapshot for User A
    await protectionService.upsertProtection(
      "user-a",
      {
        effectiveFrom: new Date("2026-04-01T00:00:00.000Z"),
        termCoverStatus: "independent",
        independentTermCoverMinor: 1_00_00_000,
        employerTermCoverMinor: null,
        independentTermExpiresOn: new Date("2050-01-01T00:00:00.000Z"),
        termNotApplicableReason: null,
        healthCoverStatus: "independent",
        independentHealthBaseCoverMinor: 10_00_000,
        independentHealthSuperTopUpMinor: null,
        employerHealthCoverMinor: null,
        independentHealthExpiresOn: new Date("2027-01-01T00:00:00.000Z"),
        dependantCount: 1
      },
      "77777777-aaaa-4111-8111-777777777777"
    );

    // Evaluate User A
    const diagA = await service.getDiagnostic("user-a", ASOF);

    expect(diagA.overallStatus).toBe("ready");
    expect(diagA.availableCapabilities).toContain("salary_statistics");
    expect(diagA.availableCapabilities).toContain("life_hour");
    expect(diagA.availableCapabilities).toContain("essential_burn");

    const burnItemA = diagA.items.find((i) => i.key === "burn_history");
    expect(burnItemA?.status).toBe("ready");
    expect(burnItemA?.evidence.completeMonthCount).toBe(3); // May, June, July (Aug excluded as current partial month)

    // Evaluate User B (Tenant isolation: should still be completely unconfigured)
    const diagB = await service.getDiagnostic("user-b", ASOF);
    expect(diagB.overallStatus).toBe("setup_required");
    expect(diagB.readyCount).toBe(0);
    expect(diagB.nextAction).toBe("configure_salary");
  });
});
