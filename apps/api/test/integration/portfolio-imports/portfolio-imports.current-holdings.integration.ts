import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { deriveAssetCurrentPosition } from "@treasury-ops/shared";

import { AssetMarketRepository } from "../../../src/assets/asset-market.repository.js";
import { AssetRepository } from "../../../src/assets/asset.repository.js";
import { AuditRepository } from "../../../src/audit/audit.repository.js";
import { withTxn } from "../../../src/common/db/db-txn.js";
import { PortfolioImportBatchRepository } from "../../../src/portfolio-imports/portfolio-import-batch.repository.js";
import { PortfolioImportEncryptionService } from "../../../src/portfolio-imports/portfolio-import-encryption.service.js";
import { PortfolioImportMatcherService } from "../../../src/portfolio-imports/portfolio-import-matcher.service.js";
import { PortfolioImportPayloadRepository } from "../../../src/portfolio-imports/portfolio-import-payload.repository.js";
import { PortfolioImportsQueue } from "../../../src/portfolio-imports/portfolio-import.queue.js";
import { PortfolioImportRowRepository } from "../../../src/portfolio-imports/portfolio-import-row.repository.js";
import { PortfolioImportService } from "../../../src/portfolio-imports/portfolio-import.service.js";
import { focusedTestDouble } from "../../../src/test/mock-drizzle.js";
import { assertLedgerInvariants } from "../support/assert-ledger-invariants.js";
import { createTestDb, insertTestUser } from "../support/postgres-test-db.js";
import type { TestDb } from "../support/postgres-test-db.js";

const USER_ID = "cas-current-holdings-user";
const ISIN = "INF000000099";

describe("PortfolioImportsService cumulative holdings integration", () => {
  let testDb: TestDb;
  let batches: PortfolioImportBatchRepository;
  let rows: PortfolioImportRowRepository;
  let assets: AssetRepository;
  let market: AssetMarketRepository;
  let service: PortfolioImportService;

  beforeAll(async () => {
    testDb = await createTestDb();
    await insertTestUser(testDb.db, USER_ID);
    batches = new PortfolioImportBatchRepository(testDb.db);
    rows = new PortfolioImportRowRepository(testDb.db);
    assets = new AssetRepository(testDb.db);
    market = new AssetMarketRepository(testDb.db);
    const encryptionKey = Buffer.alloc(32, 7).toString("base64");
    service = new PortfolioImportService(
      testDb.db,
      batches,
      new PortfolioImportPayloadRepository(testDb.db),
      rows,
      new PortfolioImportEncryptionService({
        env: { NODE_ENV: "test", PORTFOLIO_IMPORT_ENCRYPTION_KEY: encryptionKey }
      }),
      new PortfolioImportMatcherService(),
      assets,
      market,
      new AuditRepository(testDb.db),
      focusedTestDouble<PortfolioImportsQueue>({ enqueue: async () => Promise.resolve() })
    );
  });

  afterEach(async () => {
    await assertLedgerInvariants(testDb.db);
  });

  afterAll(async () => {
    await testDb.teardown();
  });

  it("reconciles snapshots by delta and replaces a subsequently closed manual asset", async () => {
    const original = await withTxn(testDb.db, async (tx) => {
      const asset = await assets.create(
        USER_ID,
        {
          kind: "investment",
          name: "Example Current Holding Fund",
          openedAt: new Date("2025-01-01"),
          openingValueMinor: 0
        },
        tx
      );
      await market.createLink(
        USER_ID,
        {
          assetId: asset.id,
          instrumentType: "mutual_fund",
          provider: "amfi",
          providerInstrumentId: ISIN,
          isin: ISIN,
          quoteUnit: "fund_unit",
          autoValuationEnabled: true,
          effectiveFrom: new Date("2025-01-01")
        },
        tx
      );
      return asset;
    });

    await commitSnapshot("a", 100_000_000, original.id, "matched");
    await commitSnapshot("b", 125_000_000, original.id, "matched");
    await commitSnapshot("c", 90_000_000, original.id, "matched");

    const originalEvents = await market.listAllPositionEventsByAsset(USER_ID, original.id);
    expect(originalEvents).toHaveLength(3);
    expect(
      originalEvents.map((event) => ({
        eventType: event.eventType,
        quantityMicroUnits: event.quantityMicroUnits
      }))
    ).toEqual(
      expect.arrayContaining([
        { eventType: "reconciliation_in", quantityMicroUnits: 100_000_000 },
        { eventType: "reconciliation_in", quantityMicroUnits: 25_000_000 },
        { eventType: "reconciliation_out", quantityMicroUnits: 35_000_000 }
      ])
    );
    expect(deriveAssetCurrentPosition(original.id, originalEvents).quantityMicroUnits).toBe(
      90_000_000
    );

    await withTxn(testDb.db, async (tx) => {
      expect(await assets.close(USER_ID, original.id, tx)).toBe(true);
    });
    const stagedReplacement = new PortfolioImportMatcherService().matchRows(
      [
        {
          rowKind: "holding",
          displayName: original.name,
          isin: ISIN,
          folioReferenceMasked: "****0099",
          occurredAt: new Date("2026-08-21"),
          quantityMicroUnits: 95_000_000,
          navMicroRupeesPerUnit: 100_000_000,
          proposedAction: "reconcile"
        }
      ],
      await assets.list(USER_ID),
      []
    );
    expect(stagedReplacement[0]?.matchStatus).toBe("unmatched");

    await commitSnapshot("d", 95_000_000, undefined, "unmatched");

    expect((await assets.findById(USER_ID, original.id))?.isClosed).toBe(true);
    expect(await market.listAllPositionEventsByAsset(USER_ID, original.id)).toEqual(originalEvents);
    const replacement = (await assets.list(USER_ID)).find((asset) => asset.name === original.name);
    if (replacement === undefined) throw new Error("Replacement asset was not created.");
    expect(replacement?.id).not.toBe(original.id);
    const replacementEvents = await market.listAllPositionEventsByAsset(USER_ID, replacement.id);
    expect(deriveAssetCurrentPosition(replacement.id, replacementEvents).quantityMicroUnits).toBe(
      95_000_000
    );
  });

  async function commitSnapshot(
    hashCharacter: string,
    quantityMicroUnits: number,
    proposedAssetId: string | undefined,
    matchStatus: "matched" | "unmatched"
  ): Promise<void> {
    const batch = await withTxn(testDb.db, (tx) =>
      batches.create(
        USER_ID,
        {
          source: "kfintech_cams",
          filename: `snapshot-${hashCharacter}.pdf`,
          fileHash: hashCharacter.repeat(64),
          status: "parsing"
        },
        tx
      )
    );
    await withTxn(testDb.db, async (tx) => {
      await rows.insertChunk(
        USER_ID,
        batch.id,
        [
          {
            rowNumber: 1,
            rowKind: "holding",
            semanticFingerprint: hashCharacter.repeat(64),
            instrumentType: "mutual_fund",
            isin: ISIN,
            displayName: "Example Current Holding Fund",
            folioReferenceMasked: "****0099",
            occurredAt: new Date("2026-08-21"),
            quantityMicroUnits,
            navMicroRupeesPerUnit: 100_000_000,
            ...(proposedAssetId === undefined ? {} : { proposedAssetId }),
            matchStatus,
            proposedAction: proposedAssetId === undefined ? "create_asset" : "reconcile",
            include: true
          }
        ],
        tx
      );
      await batches.markStaged(
        USER_ID,
        batch.id,
        { rowCount: 1, includedCount: 1, warningCount: 0, errorCount: 0 },
        { statementAsOf: new Date("2026-08-21") },
        "ready",
        tx
      );
    });
    await service.commitBatch(USER_ID, batch.id);
  }
});
