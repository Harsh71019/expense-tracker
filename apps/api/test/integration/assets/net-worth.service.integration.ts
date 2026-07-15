import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import { createConnection } from "mongoose";
import type { Connection } from "mongoose";

import { AccountRepository } from "../../../src/accounts/account.repository.js";
import { AuditRepository } from "../../../src/audit/audit.repository.js";
import { AssetRepository } from "../../../src/assets/asset.repository.js";
import { AssetService } from "../../../src/assets/asset.service.js";
import { NetWorthService } from "../../../src/assets/net-worth.service.js";
import { ValuationRepository } from "../../../src/assets/valuation.repository.js";
import { withTxn } from "../../../src/common/mongo-txn.js";

describe("NetWorthService", () => {
  let replicaSet: MongoMemoryReplSet | undefined;
  let connection: Connection | undefined;
  let netWorth: NetWorthService | undefined;
  let assets: AssetService | undefined;
  let accountRepository: AccountRepository | undefined;

  beforeAll(async () => {
    replicaSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    connection = await createConnection(replicaSet.getUri("vyaya_net_worth_test")).asPromise();
    accountRepository = new AccountRepository(connection);
    const assetRepository = new AssetRepository(connection);
    const valuationRepository = new ValuationRepository(connection);
    assets = new AssetService(
      connection,
      assetRepository,
      valuationRepository,
      new AuditRepository(connection)
    );
    netWorth = new NetWorthService(accountRepository, assetRepository, valuationRepository);
  });

  afterAll(async () => {
    if (connection !== undefined) await connection.close();
    if (replicaSet !== undefined) await replicaSet.stop();
  });

  it("sums account balances and latest asset valuations, netting out liabilities", async () => {
    const accounts = accountRepositoryInstance(accountRepository);
    await withTxn(connectedConnection(connection), async (session) =>
      accounts.create(
        "user-a",
        { name: "HDFC Savings", type: "bank", openingBalanceMinor: 200_000_00 },
        session
      )
    );

    const fd = await assetService(assets).create("user-a", {
      kind: "fixed_deposit",
      name: "HDFC FD",
      openedAt: new Date("2026-01-01T00:00:00.000Z"),
      openingValueMinor: 100_000_00
    });
    await assetService(assets).addValuation("user-a", fd.id, {
      valueMinor: 105_000_00,
      valuedAt: new Date("2026-06-01T00:00:00.000Z"),
      source: "manual"
    });

    const loan = await assetService(assets).create("user-a", {
      kind: "loan_liability",
      name: "Personal loan",
      openedAt: new Date("2026-01-01T00:00:00.000Z"),
      openingValueMinor: -50_000_00
    });

    const noValuationAsset = await assetService(assets).create("user-a", {
      kind: "investment",
      name: "New SIP",
      openedAt: new Date("2026-06-01T00:00:00.000Z"),
      openingValueMinor: 0
    });

    const result = await netWorthService(netWorth).get("user-a");

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
    const asset = await assetService(assets).create("user-c", {
      kind: "gold",
      name: "Gold ETF",
      openedAt: new Date("2026-02-01T00:00:00.000Z"),
      openingValueMinor: 30_000_00
    });
    await assetService(assets).close("user-c", asset.id);

    const result = await netWorthService(netWorth).get("user-c");

    expect(result.assets).toHaveLength(0);
    expect(result.netWorthMinor).toBe(0);
  });
});

function assetService(service: AssetService | undefined): AssetService {
  if (service === undefined) throw new Error("Asset service is not ready");
  return service;
}

function netWorthService(service: NetWorthService | undefined): NetWorthService {
  if (service === undefined) throw new Error("NetWorth service is not ready");
  return service;
}

function accountRepositoryInstance(repository: AccountRepository | undefined): AccountRepository {
  if (repository === undefined) throw new Error("Account repository is not ready");
  return repository;
}

function connectedConnection(connection: Connection | undefined): Connection {
  if (connection === undefined) throw new Error("MongoDB connection is not ready");
  return connection;
}
