import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { AccountRepository } from "../../../src/accounts/account.repository.js";
import { AuditRepository } from "../../../src/audit/audit.repository.js";
import { AssetRepository } from "../../../src/assets/asset.repository.js";
import { AssetService } from "../../../src/assets/asset.service.js";
import { AssetFundingRepository } from "../../../src/asset-fundings/asset-funding.repository.js";
import { NetWorthService } from "../../../src/net-worth/net-worth.service.js";
import { ValuationRepository } from "../../../src/assets/valuation.repository.js";
import { CategoryRepository } from "../../../src/categories/category.repository.js";
import { ReceivableNetWorthReadService } from "../../../src/receivables/receivable-net-worth-read.service.js";
import { ReceivableRepository } from "../../../src/receivables/receivable.repository.js";
import { ReceivableService } from "../../../src/receivables/receivable.service.js";
import { TransactionRepository } from "../../../src/transactions/transaction.repository.js";
import { TransactionService } from "../../../src/transactions/transaction.service.js";
import { withTxn } from "../../../src/common/db/db-txn.js";
import { createTestDb, insertTestUser } from "../support/postgres-test-db.js";
import type { TestDb } from "../support/postgres-test-db.js";

const NOOP_LOGGER = { log: () => undefined, warn: () => undefined, error: () => undefined };

describe("NetWorthService", () => {
  let testDb: TestDb;
  let netWorth: NetWorthService;
  let assets: AssetService;
  let accounts: AccountRepository;

  beforeAll(async () => {
    testDb = await createTestDb();
    await insertTestUser(testDb.db, "user-a");
    await insertTestUser(testDb.db, "user-c");
    await insertTestUser(testDb.db, "user-d");
    accounts = new AccountRepository(testDb.db);
    const assetRepository = new AssetRepository(testDb.db);
    const valuationRepository = new ValuationRepository(testDb.db);
    const audit = new AuditRepository(testDb.db);
    const receivableRepository = new ReceivableRepository(testDb.db);
    const transactionRepository = new TransactionRepository(testDb.db);
    const transactionsService = new TransactionService(
      testDb.db,
      accounts,
      new CategoryRepository(testDb.db),
      transactionRepository,
      audit,
      NOOP_LOGGER
    );
    const receivableService = new ReceivableService(
      testDb.db,
      receivableRepository,
      transactionsService,
      audit
    );
    assets = new AssetService(
      testDb.db,
      assetRepository,
      valuationRepository,
      audit,
      receivableService
    );
    const receivablesRead = new ReceivableNetWorthReadService(receivableRepository);
    netWorth = new NetWorthService(
      accounts,
      assetRepository,
      valuationRepository,
      new AssetFundingRepository(testDb.db),
      receivablesRead
    );
  }, 60_000);

  afterAll(async () => {
    await testDb.teardown();
  });

  it("sums account balances and latest asset valuations, netting out liabilities", async () => {
    await withTxn(testDb.db, (tx) =>
      accounts.create(
        "user-a",
        { name: "HDFC Savings", type: "bank", openingBalanceMinor: 200_000_00 },
        tx
      )
    );

    const fd = await assets.create("user-a", {
      kind: "fixed_deposit",
      name: "HDFC FD",
      openedAt: new Date("2026-01-01T00:00:00.000Z"),
      openingValueMinor: 100_000_00
    });
    await assets.addValuation("user-a", fd.id, {
      valueMinor: 105_000_00,
      valuedAt: new Date("2026-06-01T00:00:00.000Z"),
      source: "manual"
    });

    const loan = await assets.create("user-a", {
      kind: "loan_liability",
      name: "Personal loan",
      openedAt: new Date("2026-01-01T00:00:00.000Z"),
      openingValueMinor: -50_000_00
    });

    const noValuationAsset = await assets.create("user-a", {
      kind: "investment",
      name: "New SIP",
      openedAt: new Date("2026-06-01T00:00:00.000Z"),
      openingValueMinor: 0
    });

    const result = await netWorth.get("user-a");

    expect(result.accounts).toHaveLength(1);
    expect(result.accounts[0]).toMatchObject({ name: "HDFC Savings", balanceMinor: 200_000_00 });

    const fdEntry = result.assets.find((a) => a.assetId === fd.id);
    expect(fdEntry).toMatchObject({ valueMinor: 105_000_00 });

    const loanEntry = result.assets.find((a) => a.assetId === loan.id);
    expect(loanEntry).toMatchObject({ valueMinor: -50_000_00 });

    const zeroValuationEntry = result.assets.find((a) => a.assetId === noValuationAsset.id);
    expect(zeroValuationEntry).toMatchObject({ valueMinor: 0 });

    expect(result.netWorthMinor).toBe(200_000_00 + 105_000_00 - 50_000_00 + 0);
  });

  it("excludes closed assets from the snapshot", async () => {
    const asset = await assets.create("user-c", {
      kind: "gold",
      name: "Gold ETF",
      openedAt: new Date("2026-02-01T00:00:00.000Z"),
      openingValueMinor: 30_000_00
    });
    await assets.close("user-c", asset.id);

    const result = await netWorth.get("user-c");

    expect(result.assets).toHaveLength(0);
    expect(result.netWorthMinor).toBe(0);
  });

  it("includes a zero-opening loan_receivable asset (no linked receivable) once it gets a valuation", async () => {
    // openingValueMinor: 0 skips AssetService's compat adapter (it only
    // links a receivable when openingValueMinor > 0, since a zero-amount
    // opening event is impossible), leaving a legacy-only asset with no
    // receivables.legacy_asset_id row. AssetRepository.list()'s exclusion is
    // link-based, not kind-based, so this asset must still surface here.
    const asset = await assets.create("user-d", {
      kind: "loan_receivable",
      name: "Informal IOU",
      openedAt: new Date("2026-03-01T00:00:00.000Z"),
      openingValueMinor: 0
    });
    await assets.addValuation("user-d", asset.id, {
      valueMinor: 7_500_00,
      valuedAt: new Date("2026-04-01T00:00:00.000Z"),
      source: "manual"
    });

    const result = await netWorth.get("user-d");

    const entry = result.assets.find((a) => a.assetId === asset.id);
    expect(entry).toMatchObject({ valueMinor: 7_500_00 });
    expect(result.netWorthMinor).toBe(7_500_00);
  });
});
