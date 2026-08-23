import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { assetPositionEvents, assets } from "../../../src/common/db/schema/index.js";
import { withTxn } from "../../../src/common/db/db-txn.js";
import { assertLedgerInvariants } from "../support/assert-ledger-invariants.js";
import { createTestDb, insertTestUser } from "../support/postgres-test-db.js";
import type { TestDb } from "../support/postgres-test-db.js";
import { AssetMarketRepository } from "../../../src/assets/asset-market.repository.js";

const USER_ID = "asset-market-append-only";
const OTHER_USER_ID = "asset-market-other-user";

describe("asset-market persistence", () => {
  let testDb: TestDb;
  let repository: AssetMarketRepository;

  beforeAll(async () => {
    testDb = await createTestDb();
    await insertTestUser(testDb.db, USER_ID);
    await insertTestUser(testDb.db, OTHER_USER_ID);
    repository = new AssetMarketRepository(testDb.db);
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
});
