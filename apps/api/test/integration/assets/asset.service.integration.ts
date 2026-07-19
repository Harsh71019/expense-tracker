import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";

import { AuditRepository } from "../../../src/audit/audit.repository.js";
import { AssetRepository } from "../../../src/assets/asset.repository.js";
import { AssetService } from "../../../src/assets/asset.service.js";
import { AssetMutationService } from "../../../src/assets/asset-mutation.service.js";
import { ValuationRepository } from "../../../src/assets/valuation.repository.js";
import { assetValuations, auditLog } from "../../../src/common/db/schema/index.js";
import { IdempotencyPostgresRepository } from "../../../src/common/idempotency/idempotency-postgres.repository.js";
import { IdempotencyPostgresService } from "../../../src/common/idempotency/idempotency-postgres.service.js";
import { createTestDb, insertTestUser } from "../support/postgres-test-db.js";
import type { TestDb } from "../support/postgres-test-db.js";

describe("AssetService", () => {
  let testDb: TestDb;
  let service: AssetService;
  let mutations: AssetMutationService;

  beforeAll(async () => {
    testDb = await createTestDb();
    for (const userId of ["user-a", "user-b", "user-idempotent"]) {
      await insertTestUser(testDb.db, userId);
    }
    service = new AssetService(
      testDb.db,
      new AssetRepository(testDb.db),
      new ValuationRepository(testDb.db),
      new AuditRepository(testDb.db)
    );
    mutations = new AssetMutationService(
      service,
      new IdempotencyPostgresService(testDb.db, new IdempotencyPostgresRepository(testDb.db))
    );
  }, 60_000);

  afterAll(async () => {
    await testDb.teardown();
  });

  it("creates an asset with its opening valuation and an audit entry, atomically", async () => {
    const asset = await service.create("user-a", {
      kind: "fixed_deposit",
      name: "HDFC FD",
      openedAt: new Date("2026-01-01T00:00:00.000Z"),
      maturityAt: new Date("2027-01-01T00:00:00.000Z"),
      annualRateBps: 650,
      openingValueMinor: 100_000_00
    });

    expect(asset).toMatchObject({ kind: "fixed_deposit", name: "HDFC FD", isClosed: false });

    const [valuationRow] = await testDb.db
      .select()
      .from(assetValuations)
      .where(and(eq(assetValuations.userId, "user-a"), eq(assetValuations.assetId, asset.id)));
    expect(valuationRow).toMatchObject({ valueMinor: 100_000_00, source: "manual" });

    const [auditDoc] = await testDb.db
      .select()
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
    const asset = await service.create("user-b", {
      kind: "gold",
      name: "Gold coins",
      openedAt: new Date("2026-02-01T00:00:00.000Z"),
      quantityMilliUnits: 50_000,
      openingValueMinor: 40_000_00
    });

    const before = await service.listValuations("user-b", asset.id);
    expect(before.items).toHaveLength(1);

    let list = await service.list("user-b");
    expect(list.map((a) => a.id)).toContain(asset.id);

    await service.close("user-b", asset.id);

    list = await service.list("user-b");
    expect(list.map((a) => a.id)).not.toContain(asset.id);
  });

  it("throws when closing an asset that does not exist", async () => {
    await expect(service.close("user-a", "3fa85f64-5717-4562-b3fc-2c963f66beef")).rejects.toThrow(
      "Asset not found."
    );
  });

  it("rejects a negative valuation on a non-liability asset", async () => {
    const asset = await service.create("user-a", {
      kind: "investment",
      name: "Index fund",
      openedAt: new Date("2026-03-01T00:00:00.000Z"),
      openingValueMinor: 20_000_00
    });

    await expect(
      service.addValuation("user-a", asset.id, {
        valueMinor: -1_000_00,
        valuedAt: new Date("2026-06-01T00:00:00.000Z"),
        source: "manual"
      })
    ).rejects.toThrow("Only a loan_liability asset may carry a negative valuation.");
  });

  it("accepts a negative valuation on a loan_liability asset", async () => {
    const asset = await service.create("user-a", {
      kind: "loan_liability",
      name: "Personal loan",
      openedAt: new Date("2026-03-01T00:00:00.000Z"),
      openingValueMinor: -50_000_00
    });

    const valuation = await service.addValuation("user-a", asset.id, {
      valueMinor: -40_000_00,
      valuedAt: new Date("2026-06-01T00:00:00.000Z"),
      source: "manual"
    });

    expect(valuation.valueMinor).toBe(-40_000_00);
    const history = await service.listValuations("user-a", asset.id);
    expect(history.items.map((v) => v.valueMinor)).toEqual([-40_000_00, -50_000_00]);
  });

  it("does not allow adding a valuation to another user's asset", async () => {
    const asset = await service.create("user-a", {
      kind: "silver",
      name: "Silver bars",
      openedAt: new Date("2026-04-01T00:00:00.000Z"),
      openingValueMinor: 10_000_00
    });

    await expect(
      service.addValuation("someone-else", asset.id, {
        valueMinor: 11_000_00,
        valuedAt: new Date("2026-06-01T00:00:00.000Z"),
        source: "manual"
      })
    ).rejects.toThrow("Asset not found.");
  });

  it("does not allow adding a valuation to a closed asset", async () => {
    const asset = await service.create("user-a", {
      kind: "investment",
      name: "Closed fund",
      openedAt: new Date("2026-04-01T00:00:00.000Z"),
      openingValueMinor: 15_000_00
    });
    await service.close("user-a", asset.id);

    await expect(
      service.addValuation("user-a", asset.id, {
        valueMinor: 16_000_00,
        valuedAt: new Date("2026-06-01T00:00:00.000Z"),
        source: "manual"
      })
    ).rejects.toThrow("Asset not found.");
  });

  it("replays asset create, valuation append, and close across five attempts each", async () => {
    const creates = await Promise.all(
      Array.from({ length: 5 }, () =>
        mutations.create(
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
      await testDb.db
        .select()
        .from(assetValuations)
        .where(eq(assetValuations.userId, "user-idempotent"))
    ).toHaveLength(1);

    const valuations = await Promise.all(
      Array.from({ length: 5 }, () =>
        mutations.addValuation(
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
      await testDb.db
        .select()
        .from(assetValuations)
        .where(eq(assetValuations.userId, "user-idempotent"))
    ).toHaveLength(2);

    const closes = await Promise.all(
      Array.from({ length: 5 }, () =>
        mutations.close("user-idempotent", assetId, "99999999-aaaa-4999-8999-999999999999")
      )
    );
    expect(closes.filter((result) => !result.replayed)).toHaveLength(1);
    const auditRows = await testDb.db
      .select()
      .from(auditLog)
      .where(eq(auditLog.userId, "user-idempotent"));
    expect(auditRows).toHaveLength(3);
  });
});
