import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { AuditRepository } from "../../../src/audit/audit.repository.js";
import { AssetMarketLinkService } from "../../../src/assets/asset-market-link.service.js";
import { AssetMarketMutationService } from "../../../src/assets/asset-market-mutation.service.js";
import { AssetMarketRepository } from "../../../src/assets/asset-market.repository.js";
import { AssetPositionService } from "../../../src/assets/asset-position.service.js";
import { AssetRepository } from "../../../src/assets/asset.repository.js";
import { assetPositionEvents, assets } from "../../../src/common/db/schema/index.js";
import { withTxn } from "../../../src/common/db/db-txn.js";
import { IdempotencyPostgresRepository } from "../../../src/common/idempotency/idempotency-postgres.repository.js";
import { IdempotencyPostgresService } from "../../../src/common/idempotency/idempotency-postgres.service.js";
import { assertLedgerInvariants } from "../support/assert-ledger-invariants.js";
import { createTestDb, insertTestUser } from "../support/postgres-test-db.js";
import type { TestDb } from "../support/postgres-test-db.js";

const USER_ID = "asset-market-append-only";
const OTHER_USER_ID = "asset-market-other-user";

describe("asset-market persistence", () => {
  let testDb: TestDb;
  let repository: AssetMarketRepository;
  let links: AssetMarketLinkService;
  let mutations: AssetMarketMutationService;
  let positions: AssetPositionService;

  beforeAll(async () => {
    testDb = await createTestDb();
    await insertTestUser(testDb.db, USER_ID);
    await insertTestUser(testDb.db, OTHER_USER_ID);
    repository = new AssetMarketRepository(testDb.db);
    const assetsRepository = new AssetRepository(testDb.db);
    const audit = new AuditRepository(testDb.db);
    links = new AssetMarketLinkService(assetsRepository, repository, audit);
    positions = new AssetPositionService(assetsRepository, repository, audit);
    mutations = new AssetMarketMutationService(
      new IdempotencyPostgresService(testDb.db, new IdempotencyPostgresRepository(testDb.db)),
      links,
      positions
    );
  }, 60_000);

  afterEach(async () => {
    await assertLedgerInvariants(testDb.db);
  });

  afterAll(async () => {
    await testDb.teardown();
  });

  it("rejects updates to a position event at the database boundary", async () => {
    const assetId = randomUUID();
    const eventId = randomUUID();
    const now = new Date("2026-08-23T00:00:00.000Z");
    await testDb.db.insert(assets).values({
      id: assetId,
      userId: USER_ID,
      kind: "investment",
      name: "Index fund",
      openedAt: now,
      isClosed: false,
      createdAt: now,
      updatedAt: now
    });
    await testDb.db.insert(assetPositionEvents).values({
      id: eventId,
      userId: USER_ID,
      assetId,
      eventType: "opening",
      quantityMicroUnits: 1_000_000,
      occurredAt: now,
      source: "manual",
      sourceReference: `manual:${eventId}`,
      createdAt: now
    });

    await expect(
      testDb.db
        .update(assetPositionEvents)
        .set({ sourceReference: `changed:${eventId}` })
        .where(eq(assetPositionEvents.id, eventId))
    ).rejects.toThrow();
    const [stored] = await testDb.db
      .select({ sourceReference: assetPositionEvents.sourceReference })
      .from(assetPositionEvents)
      .where(eq(assetPositionEvents.id, eventId));
    expect(stored?.sourceReference).toBe(`manual:${eventId}`);
  });

  it("does not expose market links or position events across tenants", async () => {
    const assetId = randomUUID();
    const now = new Date("2026-08-23T00:00:00.000Z");
    await testDb.db.insert(assets).values({
      id: assetId,
      userId: USER_ID,
      kind: "investment",
      name: "Debt fund",
      openedAt: now,
      isClosed: false,
      createdAt: now,
      updatedAt: now
    });
    await withTxn(testDb.db, async (tx) => {
      await repository.createLink(
        USER_ID,
        {
          assetId,
          instrumentType: "mutual_fund",
          provider: "amfi",
          providerInstrumentId: "120503",
          quoteUnit: "fund_unit",
          autoValuationEnabled: true,
          effectiveFrom: now
        },
        tx
      );
      await repository.createPositionEvent(
        USER_ID,
        {
          assetId,
          eventType: "opening",
          quantityMicroUnits: 1_000_000,
          occurredAt: now,
          source: "manual",
          sourceReference: `manual:${assetId}`
        },
        tx
      );
    });

    await expect(repository.findActiveLinkByAssetId(OTHER_USER_ID, assetId)).resolves.toBeNull();
    await expect(repository.listPositionEventsByAsset(OTHER_USER_ID, assetId, 50)).resolves.toEqual(
      []
    );
  });

  it("creates and reverses each idempotent position event exactly once under concurrency", async () => {
    const assetId = randomUUID();
    const now = new Date("2026-08-23T00:00:00.000Z");
    await testDb.db.insert(assets).values({
      id: assetId,
      userId: USER_ID,
      kind: "investment",
      name: "Balanced fund",
      openedAt: now,
      isClosed: false,
      createdAt: now,
      updatedAt: now
    });
    await withTxn(testDb.db, (tx) =>
      links.setActiveInTx(
        USER_ID,
        assetId,
        {
          instrumentType: "mutual_fund",
          provider: "amfi",
          providerInstrumentId: "120503",
          quoteUnit: "fund_unit",
          autoValuationEnabled: true,
          effectiveFrom: now
        },
        tx
      )
    );

    const createKey = randomUUID();
    const created = await Promise.all(
      Array.from({ length: 5 }, () =>
        mutations.createPositionEvent(
          USER_ID,
          assetId,
          {
            eventType: "purchase",
            quantityMicroUnits: 1_000_000,
            grossAmountMinor: 10_000,
            occurredAt: now
          },
          createKey
        )
      )
    );
    expect(new Set(created.map((result) => result.result.id)).size).toBe(1);
    expect(created.filter((result) => result.replayed).length).toBe(4);

    const eventId = created[0]?.result.id;
    if (eventId === undefined)
      throw new Error("Idempotent position event did not return a result.");
    const reverseKey = randomUUID();
    const reversed = await Promise.all(
      Array.from({ length: 5 }, () =>
        mutations.reversePositionEvent(USER_ID, assetId, eventId, reverseKey)
      )
    );
    expect(new Set(reversed.map((result) => result.result.reversal.id)).size).toBe(1);
    expect(reversed.filter((result) => result.replayed).length).toBe(4);

    await expect(positions.listByAsset(USER_ID, assetId, { limit: 50 })).resolves.toMatchObject({
      items: [{ eventType: "reversal" }, { eventType: "purchase" }],
      pageInfo: { hasMore: false, limit: 50 }
    });
  });
});
