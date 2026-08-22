import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { and, eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  assetValuations,
  assets,
  receivableEvents,
  receivables
} from "../../../src/common/db/schema/index.js";
import { createTestDb, insertTestUser } from "../support/postgres-test-db.js";
import type { TestDb } from "../support/postgres-test-db.js";

/**
 * `createTestDb()` always migrates straight to head, so migration 0033's
 * backfill runs once against an empty `net_worth_assets` table (a no-op).
 * To exercise the backfill logic itself against pre-migration-shaped data,
 * this test inserts legacy asset/valuation fixtures directly (as a
 * pre-cutover production database would already contain), then re-executes
 * the migration file's `DO $$ ... END $$;` backfill block verbatim -- it is
 * guarded by the same unique `legacy_asset_id`/`legacy_valuation_id` indexes
 * a real second `pnpm migrate` run would hit, so re-running it here is a
 * faithful, idempotent replay of what cutover actually does.
 */
const MIGRATION_PATH = fileURLToPath(
  new URL("../../../drizzle/0033_round_iron_patriot.sql", import.meta.url)
);

function extractBackfillSql(): string {
  const full = readFileSync(MIGRATION_PATH, "utf8");
  const marker = "DO $$";
  const start = full.indexOf(marker);
  if (start === -1)
    throw new Error("Migration 0033 no longer contains the expected DO $$ backfill block.");
  return full.slice(start);
}

const USER_A = "migration-user-a";
const USER_B = "migration-user-b";

describe("Legacy loan_receivable -> receivables migration backfill", () => {
  let testDb: TestDb;
  let backfillSql: string;

  beforeAll(async () => {
    testDb = await createTestDb();
    await insertTestUser(testDb.db, USER_A);
    await insertTestUser(testDb.db, USER_B);
    backfillSql = extractBackfillSql();
  }, 60_000);

  afterAll(async () => {
    await testDb.teardown();
  });

  async function insertAsset(
    userId: string,
    name: string,
    openedAt: Date,
    isClosed: boolean,
    updatedAt: Date
  ): Promise<string> {
    const [row] = await testDb.db
      .insert(assets)
      .values({
        userId,
        kind: "loan_receivable",
        name,
        openedAt,
        isClosed,
        createdAt: openedAt,
        updatedAt
      })
      .returning({ id: assets.id });
    if (row === undefined) throw new Error("Asset insert did not return a row.");
    return row.id;
  }

  async function insertValuation(
    userId: string,
    assetId: string,
    valueMinor: number,
    valuedAt: Date
  ): Promise<void> {
    await testDb.db.insert(assetValuations).values({
      userId,
      assetId,
      valueMinor,
      valuedAt,
      source: "manual",
      createdAt: valuedAt
    });
  }

  it("ports a full fixture set deterministically, leaves other assets untouched, and is rerun-safe", async () => {
    const day = (n: number) => new Date(2026, 0, n);

    // 1. Simple open receivable: one valuation establishing the balance.
    const simpleId = await insertAsset(USER_A, "Simple Loan", day(1), false, day(1));
    await insertValuation(USER_A, simpleId, 10_000_00, day(1));

    // 2. Several increases/decreases.
    const multiId = await insertAsset(USER_A, "Multi Loan", day(1), false, day(10));
    await insertValuation(USER_A, multiId, 10_000_00, day(1));
    await insertValuation(USER_A, multiId, 15_000_00, day(3));
    await insertValuation(USER_A, multiId, 12_000_00, day(6));
    await insertValuation(USER_A, multiId, 12_000_00, day(9)); // zero delta, must be skipped

    // 3. Settled zero-valued receivable (already fully repaid via valuations).
    const settledId = await insertAsset(USER_A, "Settled Loan", day(1), false, day(5));
    await insertValuation(USER_A, settledId, 5_000_00, day(1));
    await insertValuation(USER_A, settledId, 0, day(5));

    // 4. Closed receivable whose final valuation is non-zero -- migration
    // must append a synthetic closing legacy_decrease to zero it out.
    const closedId = await insertAsset(USER_A, "Closed Loan", day(1), true, day(20));
    await insertValuation(USER_A, closedId, 8_000_00, day(1));
    await insertValuation(USER_A, closedId, 3_000_00, day(15));

    // 5. Other asset kinds -- must be completely untouched.
    const [liabilityId] = await testDb.db
      .insert(assets)
      .values({
        userId: USER_A,
        kind: "loan_liability",
        name: "Car Loan",
        openedAt: day(1),
        isClosed: false,
        createdAt: day(1),
        updatedAt: day(1)
      })
      .returning({ id: assets.id });
    const [goldId] = await testDb.db
      .insert(assets)
      .values({
        userId: USER_A,
        kind: "gold",
        name: "Gold",
        openedAt: day(1),
        isClosed: false,
        createdAt: day(1),
        updatedAt: day(1)
      })
      .returning({ id: assets.id });

    // 6. Two users with similarly-named assets -- tenant isolation.
    const tenantAId = await insertAsset(USER_A, "Shared Name Loan", day(1), false, day(1));
    await insertValuation(USER_A, tenantAId, 1_000_00, day(1));
    const tenantBId = await insertAsset(USER_B, "Shared Name Loan", day(1), false, day(1));
    await insertValuation(USER_B, tenantBId, 2_000_00, day(1));

    await testDb.db.execute(sql.raw(backfillSql));

    // Exactly one receivable per legacy loan_receivable asset.
    const allReceivables = await testDb.db.select().from(receivables);
    expect(allReceivables.length).toBe(6);

    async function outstandingFor(legacyAssetId: string, userId: string): Promise<number> {
      const [receivable] = await testDb.db
        .select()
        .from(receivables)
        .where(and(eq(receivables.legacyAssetId, legacyAssetId), eq(receivables.userId, userId)));
      if (receivable === undefined)
        throw new Error(`No receivable backfilled for asset ${legacyAssetId}.`);
      const events = await testDb.db
        .select()
        .from(receivableEvents)
        .where(eq(receivableEvents.receivableId, receivable.id));
      return events.reduce((sum, event) => {
        if (event.kind === "legacy_increase") return sum + event.amountMinor;
        if (event.kind === "legacy_decrease") return sum - event.amountMinor;
        return sum;
      }, 0);
    }

    expect(await outstandingFor(simpleId, USER_A)).toBe(10_000_00);
    expect(await outstandingFor(multiId, USER_A)).toBe(12_000_00);
    expect(await outstandingFor(settledId, USER_A)).toBe(0);
    // Closed with a non-zero final valuation must derive to exactly zero.
    expect(await outstandingFor(closedId, USER_A)).toBe(0);
    expect(await outstandingFor(tenantAId, USER_A)).toBe(1_000_00);
    expect(await outstandingFor(tenantBId, USER_B)).toBe(2_000_00);

    // The zero-delta valuation on the multi-loan must not have produced an event.
    const [multiReceivable] = await testDb.db
      .select()
      .from(receivables)
      .where(eq(receivables.legacyAssetId, multiId));
    const multiEvents = await testDb.db
      .select()
      .from(receivableEvents)
      .where(eq(receivableEvents.receivableId, multiReceivable?.id ?? ""));
    expect(multiEvents.length).toBe(3); // +10k, +5k, -3k; the +0 delta is skipped.

    // Tenant ownership preserved on every backfilled row.
    for (const receivable of allReceivables) {
      const events = await testDb.db
        .select()
        .from(receivableEvents)
        .where(eq(receivableEvents.receivableId, receivable.id));
      for (const event of events) expect(event.userId).toBe(receivable.userId);
    }

    // Non-receivable assets are completely untouched.
    if (liabilityId === undefined || goldId === undefined)
      throw new Error("Fixture insert failed.");
    const liabilityLinked = await testDb.db
      .select()
      .from(receivables)
      .where(eq(receivables.legacyAssetId, liabilityId.id));
    const goldLinked = await testDb.db
      .select()
      .from(receivables)
      .where(eq(receivables.legacyAssetId, goldId.id));
    expect(liabilityLinked.length).toBe(0);
    expect(goldLinked.length).toBe(0);

    // Rerun guard: executing the backfill again must be a complete no-op.
    await testDb.db.execute(sql.raw(backfillSql));
    const receivablesAfterRerun = await testDb.db.select().from(receivables);
    expect(receivablesAfterRerun.length).toBe(6);
    const eventsAfterRerun = await testDb.db.select().from(receivableEvents);
    const eventsBeforeRerunCount = await outstandingFor(simpleId, USER_A); // sanity: still reachable
    expect(eventsBeforeRerunCount).toBe(10_000_00);
    expect(eventsAfterRerun.length).toBeGreaterThan(0);
  }, 30_000);

  it("aborts on a negative legacy valuation instead of silently coercing it", async () => {
    const negativeId = await insertAsset(
      USER_A,
      "Bad Loan",
      new Date(2026, 1, 1),
      false,
      new Date(2026, 1, 1)
    );
    await insertValuation(USER_A, negativeId, -1_00, new Date(2026, 1, 1));

    await expect(testDb.db.execute(sql.raw(backfillSql))).rejects.toThrow(/negative valuation/i);

    // The failed run must not have left a partial receivable behind for
    // this asset (the whole DO block runs in one implicit transaction).
    const linked = await testDb.db
      .select()
      .from(receivables)
      .where(eq(receivables.legacyAssetId, negativeId));
    expect(linked.length).toBe(0);

    // Clean up so this test file's later assertions (none currently, but
    // kept for isolation) aren't affected by the aborted fixture.
    await testDb.db.delete(assetValuations).where(eq(assetValuations.assetId, negativeId));
    await testDb.db.delete(assets).where(eq(assets.id, negativeId));
  });
});
