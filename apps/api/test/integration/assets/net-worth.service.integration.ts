import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { AccountRepository } from "../../../src/accounts/account.repository.js";
import { AuditRepository } from "../../../src/audit/audit.repository.js";
import { AssetRepository } from "../../../src/assets/asset.repository.js";
import { AssetService } from "../../../src/assets/asset.service.js";
import { NetWorthService } from "../../../src/assets/net-worth.service.js";
import { ValuationRepository } from "../../../src/assets/valuation.repository.js";
import { withTxn } from "../../../src/common/db/db-txn.js";
import { createTestDb, insertTestUser } from "../support/postgres-test-db.js";
import type { TestDb } from "../support/postgres-test-db.js";

describe("NetWorthService", () => {
  let testDb: TestDb;
  let netWorth: NetWorthService;
  let assets: AssetService;
  let accounts: AccountRepository;

  beforeAll(async () => {
    testDb = await createTestDb();
    await insertTestUser(testDb.db, "user-a");
    await insertTestUser(testDb.db, "user-c");
    accounts = new AccountRepository(testDb.db);
    const assetRepository = new AssetRepository(testDb.db);
    const valuationRepository = new ValuationRepository(testDb.db);
    assets = new AssetService(
      testDb.db,
      assetRepository,
      valuationRepository,
      new AuditRepository(testDb.db)
    );
    netWorth = new NetWorthService(accounts, assetRepository, valuationRepository);
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
});
