import type { Asset } from "@treasury-ops/shared";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { AssetRepository } from "../../../src/assets/asset.repository.js";
import { AssetService } from "../../../src/assets/asset.service.js";
import { LiabilityAssetReadService } from "../../../src/assets/liability-asset-read.service.js";
import { ValuationRepository } from "../../../src/assets/valuation.repository.js";
import { AuditRepository } from "../../../src/audit/audit.repository.js";
import {
  assets,
  assetValuations,
  auditLog,
  declaredDebts
} from "../../../src/common/db/schema/index.js";
import { DeclaredDebtNotEditableError } from "../../../src/common/errors/declared-debt-not-editable.error.js";
import { DeclaredDebtNotFoundError } from "../../../src/common/errors/declared-debt-not-found.error.js";
import { LinkedAssetNotLoanLiabilityError } from "../../../src/common/errors/linked-asset-not-loan-liability.error.js";
import { LinkedAssetUnavailableError } from "../../../src/common/errors/linked-asset-unavailable.error.js";
import { IdempotencyPostgresRepository } from "../../../src/common/idempotency/idempotency-postgres.repository.js";
import { IdempotencyPostgresService } from "../../../src/common/idempotency/idempotency-postgres.service.js";
import { DebtProfileService } from "../../../src/financial-profiles/debt-profile.service.js";
import { DeclaredDebtRepository } from "../../../src/financial-profiles/debt-profile.repository.js";
import { CategoryRepository } from "../../../src/categories/category.repository.js";
import { AccountRepository } from "../../../src/accounts/account.repository.js";
import { ReceivableRepository } from "../../../src/receivables/receivable.repository.js";
import { ReceivableService } from "../../../src/receivables/receivable.service.js";
import { TransactionRepository } from "../../../src/transactions/transaction.repository.js";
import { TransactionService } from "../../../src/transactions/transaction.service.js";
import { createTestDb, insertTestUser } from "../support/postgres-test-db.js";
import type { TestDb } from "../support/postgres-test-db.js";

const ACTIVE = { limit: 50, status: "active" } as const;
const NOOP_LOGGER = { log: () => undefined, warn: () => undefined, error: () => undefined };

function key(seed: string): string {
  return `${seed}-1111-4111-8111-111111111111`;
}

describe("DebtProfileService", () => {
  let testDb: TestDb;
  let service: DebtProfileService;
  let assetService: AssetService;
  let loanA: Asset;
  let closedLoanA: Asset;
  let investmentA: Asset;
  let loanB: Asset;

  beforeAll(async () => {
    testDb = await createTestDb();
    for (const userId of ["user-a", "user-b", "user-page", "user-concurrent"]) {
      await insertTestUser(testDb.db, userId);
    }

    const audit = new AuditRepository(testDb.db);
    const receivableRepository = new ReceivableRepository(testDb.db);
    const transactionRepository = new TransactionRepository(testDb.db);
    const transactionsService = new TransactionService(
      testDb.db,
      new AccountRepository(testDb.db),
      new CategoryRepository(testDb.db),
      transactionRepository,
      audit,
      NOOP_LOGGER
    );
    const receivableService = new ReceivableService(
      testDb.db,
      receivableRepository,
      transactionsService,
      transactionRepository,
      audit
    );
    assetService = new AssetService(
      testDb.db,
      new AssetRepository(testDb.db),
      new ValuationRepository(testDb.db),
      audit,
      receivableService,
      receivableRepository
    );
    service = new DebtProfileService(
      new DeclaredDebtRepository(testDb.db),
      new LiabilityAssetReadService(testDb.db),
      new AuditRepository(testDb.db),
      new IdempotencyPostgresService(testDb.db, new IdempotencyPostgresRepository(testDb.db))
    );

    loanA = await assetService.create("user-a", {
      kind: "loan_liability",
      name: "Car loan",
      openedAt: new Date("2026-01-01T00:00:00.000Z"),
      openingValueMinor: -4_00_000_00
    });
    closedLoanA = await assetService.create("user-a", {
      kind: "loan_liability",
      name: "Old loan",
      openedAt: new Date("2025-01-01T00:00:00.000Z"),
      openingValueMinor: -1_00_000_00
    });
    await assetService.close("user-a", closedLoanA.id);
    investmentA = await assetService.create("user-a", {
      kind: "investment",
      name: "Index fund",
      openedAt: new Date("2026-01-01T00:00:00.000Z"),
      openingValueMinor: 5_00_000_00
    });
    loanB = await assetService.create("user-b", {
      kind: "loan_liability",
      name: "Neighbour's loan",
      openedAt: new Date("2026-01-01T00:00:00.000Z"),
      openingValueMinor: -2_00_000_00
    });
  }, 60_000);

  afterAll(async () => {
    await testDb.teardown();
  });

  it("declares an unlinked debt as an estimate, with an audit entry and no amounts in it", async () => {
    const created = await service.create(
      "user-a",
      {
        name: "Amex revolve",
        kind: "credit_card",
        declaredOutstandingMinor: 85_000_00,
        annualRateBps: 4_200,
        minimumPaymentMinor: 5_000_00,
        linkedAssetId: null
      },
      key("aaaaaaaa")
    );

    expect(created.result).toMatchObject({
      amountSource: "declared",
      isEstimate: true,
      outstandingMinor: 85_000_00,
      isHighCost: true,
      status: "active",
      linkedAssetId: null
    });

    const [audit] = await testDb.db
      .select()
      .from(auditLog)
      .where(
        and(
          eq(auditLog.userId, "user-a"),
          eq(auditLog.action, "financial_profile.declared_debt.create")
        )
      );
    expect(audit?.entityId).toBe(created.result.id);
    const serialized = JSON.stringify(audit?.meta);
    expect(serialized).not.toContain("8500000");
    expect(serialized).not.toContain("500000");
    expect(audit?.meta).toMatchObject({ kind: "credit_card", isLinked: false, status: "active" });
  });

  it("derives a linked debt's outstanding amount from the asset's latest valuation", async () => {
    const created = await service.create(
      "user-a",
      {
        name: "Car loan",
        kind: "consumer_loan",
        declaredOutstandingMinor: null,
        annualRateBps: 900,
        minimumPaymentMinor: null,
        linkedAssetId: loanA.id
      },
      key("bbbbbbbb")
    );

    expect(created.result).toMatchObject({
      amountSource: "linked_asset",
      isEstimate: false,
      linkedAssetName: "Car loan",
      outstandingMinor: 4_00_000_00,
      isHighCost: false,
      declaredOutstandingMinor: null
    });

    // A newer valuation moves the debt's amount without touching the debt row.
    await assetService.addValuation("user-a", loanA.id, {
      valueMinor: -3_20_000_00,
      valuedAt: new Date("2026-08-10T00:00:00.000Z"),
      source: "manual"
    });

    const page = await service.list("user-a", ACTIVE);
    const linked = page.items.find((debt) => debt.linkedAssetId === loanA.id);
    expect(linked).toMatchObject({
      outstandingMinor: 3_20_000_00,
      valuationAsOf: new Date("2026-08-10T00:00:00.000Z")
    });

    const [row] = await testDb.db
      .select()
      .from(declaredDebts)
      .where(eq(declaredDebts.id, created.result.id));
    expect(row?.declaredOutstandingMinor).toBeNull();
  });

  it("refuses to link another tenant's loan liability, reporting it as unavailable", async () => {
    await expect(
      service.create(
        "user-a",
        {
          name: "Not mine",
          kind: "personal_loan",
          declaredOutstandingMinor: null,
          annualRateBps: 1_100,
          minimumPaymentMinor: null,
          linkedAssetId: loanB.id
        },
        key("cccccccc")
      )
    ).rejects.toThrow(LinkedAssetUnavailableError);
  });

  it("refuses to link a closed asset or a non-loan-liability asset", async () => {
    await expect(
      service.create(
        "user-a",
        {
          name: "Closed loan",
          kind: "personal_loan",
          declaredOutstandingMinor: null,
          annualRateBps: 1_100,
          minimumPaymentMinor: null,
          linkedAssetId: closedLoanA.id
        },
        key("dddddddd")
      )
    ).rejects.toThrow(LinkedAssetUnavailableError);

    await expect(
      service.create(
        "user-a",
        {
          name: "Index fund",
          kind: "other",
          declaredOutstandingMinor: null,
          annualRateBps: 1_100,
          minimumPaymentMinor: null,
          linkedAssetId: investmentA.id
        },
        key("eeeeeeee")
      )
    ).rejects.toThrow(LinkedAssetNotLoanLiabilityError);

    const rows = await testDb.db
      .select()
      .from(declaredDebts)
      .where(eq(declaredDebts.userId, "user-a"));
    expect(rows.filter((row) => row.name === "Closed loan" || row.name === "Index fund")).toEqual(
      []
    );
  });

  it("classifies exactly 1200 bps as ordinary and 1201 bps as high cost", async () => {
    const atThreshold = await service.create(
      "user-page",
      {
        name: "Twelve percent",
        kind: "personal_loan",
        declaredOutstandingMinor: 1_00_000_00,
        annualRateBps: 1_200,
        minimumPaymentMinor: null,
        linkedAssetId: null
      },
      key("f1111111")
    );
    const aboveThreshold = await service.create(
      "user-page",
      {
        name: "Just above",
        kind: "bnpl",
        declaredOutstandingMinor: 10_000_00,
        annualRateBps: 1_201,
        minimumPaymentMinor: null,
        linkedAssetId: null
      },
      key("f2222222")
    );

    expect(atThreshold.result.isHighCost).toBe(false);
    expect(aboveThreshold.result.isHighCost).toBe(true);

    const page = await service.list("user-page", ACTIVE);
    expect(page.highCost).toMatchObject({
      thresholdBps: 1_200,
      comparison: "greater_than",
      highCostCount: 1
    });
  });

  it("paginates active debts newest first with a stable cursor", async () => {
    const firstPage = await service.list("user-page", { limit: 1, status: "active" });
    expect(firstPage.items).toHaveLength(1);
    expect(firstPage.items[0]?.name).toBe("Just above");
    expect(firstPage.pageInfo.hasMore).toBe(true);

    const cursor = firstPage.pageInfo.nextCursor;
    if (cursor === null) throw new Error("Expected a debt cursor.");
    const secondPage = await service.list("user-page", { limit: 1, status: "active", cursor });

    expect(secondPage.items[0]?.name).toBe("Twelve percent");
    expect(secondPage.pageInfo.hasMore).toBe(false);
  });

  it("resolves a debt without deleting it, touching its asset, or valuing anything", async () => {
    const linked = (await service.list("user-a", ACTIVE)).items.find(
      (debt) => debt.linkedAssetId === loanA.id
    );
    if (linked === undefined) throw new Error("Expected the linked debt.");

    const assetsBefore = await testDb.db.select().from(assets).where(eq(assets.id, loanA.id));
    const valuationsBefore = await testDb.db
      .select()
      .from(assetValuations)
      .where(eq(assetValuations.assetId, loanA.id));

    const resolved = await service.update(
      "user-a",
      linked.id,
      { status: "resolved" },
      key("f3333333")
    );

    expect(resolved.result).toMatchObject({ status: "resolved", linkedAssetId: loanA.id });
    expect(resolved.result.resolvedAt).not.toBeNull();

    const active = await service.list("user-a", ACTIVE);
    expect(active.items.map((debt) => debt.id)).not.toContain(linked.id);

    const resolvedPage = await service.list("user-a", { limit: 50, status: "resolved" });
    expect(resolvedPage.items.map((debt) => debt.id)).toContain(linked.id);

    const assetsAfter = await testDb.db.select().from(assets).where(eq(assets.id, loanA.id));
    const valuationsAfter = await testDb.db
      .select()
      .from(assetValuations)
      .where(eq(assetValuations.assetId, loanA.id));
    expect(assetsAfter).toEqual(assetsBefore);
    expect(valuationsAfter).toEqual(valuationsBefore);
  });

  it("refuses to change a resolved debt", async () => {
    const resolved = (await service.list("user-a", { limit: 50, status: "resolved" })).items[0];
    if (resolved === undefined) throw new Error("Expected a resolved debt.");

    await expect(
      service.update("user-a", resolved.id, { name: "Renamed" }, key("f4444444"))
    ).rejects.toThrow(DeclaredDebtNotEditableError);
  });

  it("refuses to hand-edit the outstanding amount of a linked debt", async () => {
    const created = await service.create(
      "user-a",
      {
        name: "Second car loan",
        kind: "consumer_loan",
        declaredOutstandingMinor: null,
        annualRateBps: 950,
        minimumPaymentMinor: null,
        linkedAssetId: loanA.id
      },
      key("f5555555")
    );

    await expect(
      service.update(
        "user-a",
        created.result.id,
        { declaredOutstandingMinor: 1_00_00_000 },
        key("f6666666")
      )
    ).rejects.toThrow(DeclaredDebtNotEditableError);
  });

  it("updates permitted metadata on an unlinked debt", async () => {
    const created = await service.create(
      "user-a",
      {
        name: "Store card",
        kind: "credit_card",
        declaredOutstandingMinor: 12_000_00,
        annualRateBps: 3_600,
        minimumPaymentMinor: null,
        linkedAssetId: null
      },
      key("f7777777")
    );

    const updated = await service.update(
      "user-a",
      created.result.id,
      { name: "Store card (closed to new spend)", declaredOutstandingMinor: 9_000_00 },
      key("f8888888")
    );

    expect(updated.result).toMatchObject({
      name: "Store card (closed to new spend)",
      outstandingMinor: 9_000_00,
      isEstimate: true,
      status: "active"
    });
  });

  it("treats another tenant's debt id as not found", async () => {
    const foreign = (await service.list("user-a", ACTIVE)).items[0];
    if (foreign === undefined) throw new Error("Expected a debt to probe with.");

    await expect(
      service.update("user-b", foreign.id, { name: "Stolen" }, key("f9999999"))
    ).rejects.toThrow(DeclaredDebtNotFoundError);
    expect((await service.list("user-b", ACTIVE)).items).toEqual([]);
  });

  it("creates exactly one debt under five concurrent identical requests", async () => {
    const body = {
      name: "Concurrent card",
      kind: "credit_card",
      declaredOutstandingMinor: 20_000_00,
      annualRateBps: 4_000,
      minimumPaymentMinor: null,
      linkedAssetId: null
    } as const;

    const results = await Promise.all(
      Array.from({ length: 5 }, () => service.create("user-concurrent", body, key("fa111111")))
    );

    expect(new Set(results.map((result) => result.result.id)).size).toBe(1);
    const rows = await testDb.db
      .select()
      .from(declaredDebts)
      .where(eq(declaredDebts.userId, "user-concurrent"));
    expect(rows).toHaveLength(1);

    const audits = await testDb.db
      .select()
      .from(auditLog)
      .where(
        and(
          eq(auditLog.userId, "user-concurrent"),
          eq(auditLog.action, "financial_profile.declared_debt.create")
        )
      );
    expect(audits).toHaveLength(1);
  });

  it("resolves exactly once under five concurrent identical resolve requests", async () => {
    const debt = (await service.list("user-concurrent", ACTIVE)).items[0];
    if (debt === undefined) throw new Error("Expected the concurrent debt.");

    const results = await Promise.all(
      Array.from({ length: 5 }, () =>
        service.update("user-concurrent", debt.id, { status: "resolved" }, key("fb111111"))
      )
    );

    expect(results.every((result) => result.result.status === "resolved")).toBe(true);
    const audits = await testDb.db
      .select()
      .from(auditLog)
      .where(
        and(
          eq(auditLog.userId, "user-concurrent"),
          eq(auditLog.action, "financial_profile.declared_debt.update")
        )
      );
    expect(audits).toHaveLength(1);
  });
});
