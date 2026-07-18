import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import { createConnection } from "mongoose";
import type { Connection } from "mongoose";

import { AuditRepository } from "../../../src/audit/audit.repository.js";
import { AssetRepository } from "../../../src/assets/asset.repository.js";
import { AssetService } from "../../../src/assets/asset.service.js";
import { AssetMutationService } from "../../../src/assets/asset-mutation.service.js";
import { ValuationRepository } from "../../../src/assets/valuation.repository.js";
import { auditLog } from "../../../src/common/db/schema/index.js";
import { IdempotencyRepository } from "../../../src/common/idempotency/idempotency.repository.js";
import { IdempotencyService } from "../../../src/common/idempotency/idempotency.service.js";
import { createTestDb, insertTestUser } from "../support/postgres-test-db.js";
import type { TestDb } from "../support/postgres-test-db.js";

describe("AssetService", () => {
  let replicaSet: MongoMemoryReplSet | undefined;
  let connection: Connection | undefined;
  let pgTestDb: TestDb | undefined;
  let service: AssetService | undefined;
  let mutations: AssetMutationService | undefined;

  beforeAll(async () => {
    replicaSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    connection = await createConnection(replicaSet.getUri("vyaya_assets_test")).asPromise();
    // assets/valuations are still Mongo (Tasks 16/17 not done); audit_log moved to
    // Postgres in Task 11 -- AssetService now threads both.
    pgTestDb = await createTestDb();
    for (const userId of ["user-a", "user-b", "user-idempotent"]) {
      await insertTestUser(pgTestDb.db, userId);
    }
    service = new AssetService(
      connection,
      pgTestDb.db,
      new AssetRepository(connection),
      new ValuationRepository(connection),
      new AuditRepository(pgTestDb.db)
    );
    mutations = new AssetMutationService(
      connection,
      service,
      new IdempotencyService(new IdempotencyRepository(connection))
    );
    await connectedDatabase(connection)
      .collection("idempotency_records")
      .createIndex({ userId: 1, operation: 1, key: 1 }, { unique: true });
  }, 60_000);

  afterAll(async () => {
    if (connection !== undefined) await connection.close();
    if (replicaSet !== undefined) await replicaSet.stop();
    if (pgTestDb !== undefined) await pgTestDb.teardown();
  });

  it("creates an asset with its opening valuation and an audit entry, atomically", async () => {
    const asset = await assetService(service).create("user-a", {
      kind: "fixed_deposit",
      name: "HDFC FD",
      openedAt: new Date("2026-01-01T00:00:00.000Z"),
      maturityAt: new Date("2027-01-01T00:00:00.000Z"),
      annualRateBps: 650,
      openingValueMinor: 100_000_00
    });

    expect(asset).toMatchObject({ kind: "fixed_deposit", name: "HDFC FD", isClosed: false });

    const valuationDoc = await connectedDatabase(connection)
      .collection("asset_valuations")
      .findOne({ userId: "user-a", assetId: { $exists: true } });
    expect(valuationDoc).toMatchObject({ valueMinor: 100_000_00, source: "manual" });

    const [auditDoc] = await requirePgTestDb(pgTestDb)
      .db.select()
      .from(auditLog)
      .where(
        and(
          eq(auditLog.userId, "user-a"),
          eq(auditLog.action, "asset.create"),
          eq(auditLog.entityId, asset.id)
        )
      );
    expect(auditDoc?.meta).toMatchObject({ valueMinor: 100_000_00 });
  });

  it("lists only open assets for the requesting user", async () => {
    const asset = await assetService(service).create("user-b", {
      kind: "gold",
      name: "Gold coins",
      openedAt: new Date("2026-02-01T00:00:00.000Z"),
      quantityMilliUnits: 50_000,
      openingValueMinor: 40_000_00
    });

    const before = await assetService(service).listValuations("user-b", asset.id);
    expect(before.items).toHaveLength(1);

    let list = await assetService(service).list("user-b");
    expect(list.map((a) => a.id)).toContain(asset.id);

    await assetService(service).close("user-b", asset.id);

    list = await assetService(service).list("user-b");
    expect(list.map((a) => a.id)).not.toContain(asset.id);
  });

  it("throws when closing an asset that does not exist", async () => {
    await expect(assetService(service).close("user-a", "507f1f77bcf86cd799439011")).rejects.toThrow(
      "Asset not found."
    );
  });

  it("rejects a negative valuation on a non-liability asset", async () => {
    const asset = await assetService(service).create("user-a", {
      kind: "investment",
      name: "Index fund",
      openedAt: new Date("2026-03-01T00:00:00.000Z"),
      openingValueMinor: 20_000_00
    });

    await expect(
      assetService(service).addValuation("user-a", asset.id, {
        valueMinor: -1_000_00,
        valuedAt: new Date("2026-06-01T00:00:00.000Z"),
        source: "manual"
      })
    ).rejects.toThrow("Only a loan_liability asset may carry a negative valuation.");
  });

  it("accepts a negative valuation on a loan_liability asset", async () => {
    const asset = await assetService(service).create("user-a", {
      kind: "loan_liability",
      name: "Personal loan",
      openedAt: new Date("2026-03-01T00:00:00.000Z"),
      openingValueMinor: -50_000_00
    });

    const valuation = await assetService(service).addValuation("user-a", asset.id, {
      valueMinor: -40_000_00,
      valuedAt: new Date("2026-06-01T00:00:00.000Z"),
      source: "manual"
    });

    expect(valuation.valueMinor).toBe(-40_000_00);
    const history = await assetService(service).listValuations("user-a", asset.id);
    expect(history.items.map((v) => v.valueMinor)).toEqual([-40_000_00, -50_000_00]);
  });

  it("does not allow adding a valuation to another user's asset", async () => {
    const asset = await assetService(service).create("user-a", {
      kind: "silver",
      name: "Silver bars",
      openedAt: new Date("2026-04-01T00:00:00.000Z"),
      openingValueMinor: 10_000_00
    });

    await expect(
      assetService(service).addValuation("someone-else", asset.id, {
        valueMinor: 11_000_00,
        valuedAt: new Date("2026-06-01T00:00:00.000Z"),
        source: "manual"
      })
    ).rejects.toThrow("Asset not found.");
  });

  it("does not allow adding a valuation to a closed asset", async () => {
    const asset = await assetService(service).create("user-a", {
      kind: "investment",
      name: "Closed fund",
      openedAt: new Date("2026-04-01T00:00:00.000Z"),
      openingValueMinor: 15_000_00
    });
    await assetService(service).close("user-a", asset.id);

    await expect(
      assetService(service).addValuation("user-a", asset.id, {
        valueMinor: 16_000_00,
        valuedAt: new Date("2026-06-01T00:00:00.000Z"),
        source: "manual"
      })
    ).rejects.toThrow("Asset not found.");
  });

  it("replays asset create, valuation append, and close across five attempts each", async () => {
    const mutation = assetMutations(mutations);
    const creates = await Promise.all(
      Array.from({ length: 5 }, () =>
        mutation.create(
          "user-idempotent",
          {
            kind: "investment",
            name: "Replay-safe fund",
            openedAt: new Date("2026-05-01T00:00:00.000Z"),
            openingValueMinor: 25_000_00
          },
          "77777777-aaaa-4777-8777-777777777777"
        )
      )
    );
    expect(creates.filter((result) => !result.replayed)).toHaveLength(1);
    const assetId = creates[0]?.result.id;
    if (assetId === undefined) throw new Error("Expected a created asset");
    expect(
      await connectedDatabase(connection)
        .collection("asset_valuations")
        .countDocuments({ userId: "user-idempotent" })
    ).toBe(1);

    const valuations = await Promise.all(
      Array.from({ length: 5 }, () =>
        mutation.addValuation(
          "user-idempotent",
          assetId,
          {
            valueMinor: 26_000_00,
            valuedAt: new Date("2026-07-01T00:00:00.000Z"),
            source: "manual"
          },
          "88888888-aaaa-4888-8888-888888888888"
        )
      )
    );
    expect(valuations.filter((result) => !result.replayed)).toHaveLength(1);
    expect(
      await connectedDatabase(connection)
        .collection("asset_valuations")
        .countDocuments({ userId: "user-idempotent" })
    ).toBe(2);

    const closes = await Promise.all(
      Array.from({ length: 5 }, () =>
        mutation.close("user-idempotent", assetId, "99999999-aaaa-4999-8999-999999999999")
      )
    );
    expect(closes.filter((result) => !result.replayed)).toHaveLength(1);
    const auditRows = await requirePgTestDb(pgTestDb)
      .db.select()
      .from(auditLog)
      .where(eq(auditLog.userId, "user-idempotent"));
    expect(auditRows).toHaveLength(3);
  });
});

function assetService(service: AssetService | undefined): AssetService {
  if (service === undefined) throw new Error("Asset service is not ready");
  return service;
}

function assetMutations(service: AssetMutationService | undefined): AssetMutationService {
  if (service === undefined) throw new Error("Asset mutation service is not ready");
  return service;
}

function connectedDatabase(connection: Connection | undefined): NonNullable<Connection["db"]> {
  if (connection === undefined) throw new Error("MongoDB connection is not ready");
  const database = connection.db;
  if (database === undefined) throw new Error("MongoDB database is not ready");
  return database;
}

function requirePgTestDb(testDb: TestDb | undefined): TestDb {
  if (testDb === undefined) throw new Error("Postgres test db is not ready");
  return testDb;
}
