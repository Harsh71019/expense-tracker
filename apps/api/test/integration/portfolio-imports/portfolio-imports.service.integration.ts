import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

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

const USER_ID = "cas-import-user-1";
const OTHER_USER_ID = "cas-import-user-2";

describe("PortfolioImportsService integration", () => {
  let testDb: TestDb;
  let batchRepo: PortfolioImportBatchRepository;
  let payloadRepo: PortfolioImportPayloadRepository;
  let rowRepo: PortfolioImportRowRepository;
  let assetRepo: AssetRepository;
  let marketRepo: AssetMarketRepository;
  let auditRepo: AuditRepository;
  let service: PortfolioImportService;

  beforeAll(async () => {
    testDb = await createTestDb();
    await insertTestUser(testDb.db, USER_ID);
    await insertTestUser(testDb.db, OTHER_USER_ID);

    batchRepo = new PortfolioImportBatchRepository(testDb.db);
    payloadRepo = new PortfolioImportPayloadRepository(testDb.db);
    rowRepo = new PortfolioImportRowRepository(testDb.db);
    assetRepo = new AssetRepository(testDb.db);
    marketRepo = new AssetMarketRepository(testDb.db);
    auditRepo = new AuditRepository(testDb.db);

    const mockQueue = focusedTestDouble<PortfolioImportsQueue>({
      enqueue: async () => Promise.resolve()
    });

    const encryptionKey = Buffer.alloc(32, 7).toString("base64");
    const encryptionService = new PortfolioImportEncryptionService({
      env: { NODE_ENV: "test", PORTFOLIO_IMPORT_ENCRYPTION_KEY: encryptionKey }
    });

    service = new PortfolioImportService(
      testDb.db,
      batchRepo,
      payloadRepo,
      rowRepo,
      encryptionService,
      new PortfolioImportMatcherService(),
      assetRepo,
      marketRepo,
      auditRepo,
      mockQueue
    );
  });

  afterEach(async () => {
    await assertLedgerInvariants(testDb.db);
  });

  afterAll(async () => {
    await testDb.teardown();
  });

  it("stages, commits, and reverts CAS rows with strict append-only reversals", async () => {
    // 1. Manually insert batch and staged rows for testing commit & revert
    const batch = await withTxn(testDb.db, (tx) =>
      batchRepo.create(
        USER_ID,
        {
          source: "kfintech_cams",
          filename: "test_statement.pdf",
          fileHash: "a".repeat(64),
          status: "parsing"
        },
        tx
      )
    );

    const rowInputs = [
      {
        rowNumber: 1,
        rowKind: "transaction" as const,
        semanticFingerprint: "1".repeat(64),
        instrumentType: "mutual_fund" as const,
        isin: "INF879O01019",
        schemeCode: "122639",
        displayName: "Parag Parikh Flexi Cap Fund Direct Growth",
        folioReferenceMasked: "****1234",
        transactionType: "purchase",
        occurredAt: new Date("2025-01-01"),
        quantityMicroUnits: 100_000_000,
        grossAmountMinor: 500000,
        navMicroRupeesPerUnit: 50_000_000,
        matchStatus: "unmatched" as const,
        proposedAction: "create_asset" as const,
        include: true
      },
      {
        rowNumber: 2,
        rowKind: "holding" as const,
        semanticFingerprint: "2".repeat(64),
        instrumentType: "mutual_fund" as const,
        isin: "INF879O01019",
        schemeCode: "122639",
        displayName: "Parag Parikh Flexi Cap Fund Direct Growth",
        folioReferenceMasked: "****1234",
        quantityMicroUnits: 100_000_000,
        matchStatus: "unmatched" as const,
        proposedAction: "create_asset" as const,
        include: true
      }
    ];

    await withTxn(testDb.db, async (tx) => {
      await rowRepo.insertChunk(USER_ID, batch.id, rowInputs, tx);
      await batchRepo.markStaged(
        USER_ID,
        batch.id,
        { rowCount: 2, includedCount: 2, warningCount: 0, errorCount: 0 },
        { statementAsOf: new Date("2026-08-20") },
        "ready",
        tx
      );
    });

    const staged = await service.getBatch(USER_ID, batch.id);
    expect(staged.status).toBe("ready");
    expect(staged.rowCount).toBe(2);

    // 2. Pagination test
    const page = await service.getRowsPage(USER_ID, batch.id, undefined, 10);
    expect(page.items).toHaveLength(2);

    // 3. Commit batch
    const committed = await service.commitBatch(USER_ID, batch.id);
    expect(committed.status).toBe("completed");

    // Verify created asset and market link
    const userAssets = await assetRepo.list(USER_ID);
    const createdAsset = userAssets.find(
      (a) => a.name === "Parag Parikh Flexi Cap Fund Direct Growth"
    );
    expect(createdAsset).toBeDefined();

    const link = await marketRepo.findActiveLinkByAssetId(USER_ID, createdAsset?.id ?? "");
    expect(link).toBeDefined();
    expect(link?.isin).toBe("INF879O01019");

    // Verify position events
    const events = await marketRepo.listAllPositionEventsByAsset(USER_ID, createdAsset?.id ?? "");
    expect(events.length).toBeGreaterThanOrEqual(1);
    expect(events.some((e) => e.source === "cas")).toBe(true);

    // 4. Revert batch
    const reverted = await service.revertBatch(USER_ID, batch.id);
    expect(reverted.status).toBe("reverted");

    // Verify reversal position events were appended (never deleted)
    const postRevertEvents = await marketRepo.listAllPositionEventsByAsset(
      USER_ID,
      createdAsset?.id ?? ""
    );
    expect(postRevertEvents.length).toBe(events.length * 2);
    expect(postRevertEvents.some((e) => e.eventType === "reversal")).toBe(true);
  });

  it("handles >= 5 concurrent commit calls idempotently without duplicate position events", async () => {
    const batch = await withTxn(testDb.db, (tx) =>
      batchRepo.create(
        USER_ID,
        {
          source: "kfintech_cams",
          filename: "concurrent_test.pdf",
          fileHash: "b".repeat(64),
          status: "parsing"
        },
        tx
      )
    );

    await withTxn(testDb.db, async (tx) => {
      await rowRepo.insertChunk(
        USER_ID,
        batch.id,
        [
          {
            rowNumber: 1,
            rowKind: "transaction" as const,
            semanticFingerprint: "3".repeat(64),
            instrumentType: "mutual_fund" as const,
            isin: "INF109K012R6",
            displayName: "ICICI Prudential Bluechip Fund Direct Growth",
            folioReferenceMasked: "****5555",
            transactionType: "purchase",
            occurredAt: new Date("2025-06-01"),
            quantityMicroUnits: 50_000_000,
            grossAmountMinor: 300000,
            matchStatus: "unmatched" as const,
            proposedAction: "create_asset" as const,
            include: true
          }
        ],
        tx
      );
      await batchRepo.markStaged(
        USER_ID,
        batch.id,
        { rowCount: 1, includedCount: 1, warningCount: 0, errorCount: 0 },
        {},
        "ready",
        tx
      );
    });

    const results = await Promise.all([
      service.commitBatch(USER_ID, batch.id),
      service.commitBatch(USER_ID, batch.id),
      service.commitBatch(USER_ID, batch.id),
      service.commitBatch(USER_ID, batch.id),
      service.commitBatch(USER_ID, batch.id)
    ]);

    for (const res of results) {
      expect(res.status).toBe("completed");
    }

    const assets = await assetRepo.list(USER_ID);
    const iciciAsset = assets.find(
      (a) => a.name === "ICICI Prudential Bluechip Fund Direct Growth"
    );
    expect(iciciAsset).toBeDefined();

    const events = await marketRepo.listAllPositionEventsByAsset(USER_ID, iciciAsset?.id ?? "");
    const casEvents = events.filter((e) => e.source === "cas");
    expect(casEvents).toHaveLength(1);
  });

  it("enforces tenant isolation across batches and rows", async () => {
    const user1Batch = await withTxn(testDb.db, (tx) =>
      batchRepo.create(
        USER_ID,
        {
          source: "kfintech_cams",
          filename: "user1.pdf",
          fileHash: "c".repeat(64),
          status: "parsing"
        },
        tx
      )
    );

    // Other user cannot view or mutate user 1's batch
    await expect(service.getBatch(OTHER_USER_ID, user1Batch.id)).rejects.toThrow();
    const otherUserBatches = await service.listBatches(OTHER_USER_ID);
    expect(otherUserBatches.find((b) => b.id === user1Batch.id)).toBeUndefined();
  });

  it("deletes a stuck parsing batch idempotently under concurrent retries", async () => {
    const batch = await withTxn(testDb.db, (tx) =>
      batchRepo.create(
        USER_ID,
        {
          source: "kfintech_cams",
          filename: "stuck-delete.pdf",
          fileHash: "d".repeat(64),
          status: "parsing"
        },
        tx
      )
    );
    await withTxn(testDb.db, (tx) =>
      rowRepo.insertChunk(
        USER_ID,
        batch.id,
        [
          {
            rowNumber: 1,
            rowKind: "holding",
            semanticFingerprint: "d".repeat(64),
            instrumentType: "mutual_fund",
            displayName: "Stuck holding",
            quantityMicroUnits: 1_000_000,
            matchStatus: "unmatched",
            proposedAction: "create_asset",
            include: true
          }
        ],
        tx
      )
    );

    await Promise.all([
      service.deleteBatch(USER_ID, batch.id),
      service.deleteBatch(USER_ID, batch.id),
      service.deleteBatch(USER_ID, batch.id),
      service.deleteBatch(USER_ID, batch.id),
      service.deleteBatch(USER_ID, batch.id)
    ]);

    expect(await batchRepo.findById(USER_ID, batch.id)).toBeNull();
    expect(await rowRepo.listAllForBatch(USER_ID, batch.id)).toEqual([]);
  });

  it("keeps deletion tenant-scoped", async () => {
    const batch = await withTxn(testDb.db, (tx) =>
      batchRepo.create(
        USER_ID,
        {
          source: "kfintech_cams",
          filename: "tenant-delete.pdf",
          fileHash: "e".repeat(64),
          status: "failed"
        },
        tx
      )
    );

    await service.deleteBatch(OTHER_USER_ID, batch.id);
    expect(await batchRepo.findById(USER_ID, batch.id)).not.toBeNull();
    await service.deleteBatch(USER_ID, batch.id);
  });

  it("rejects deletion after a batch reaches completed", async () => {
    const batch = await withTxn(testDb.db, (tx) =>
      batchRepo.create(
        USER_ID,
        {
          source: "kfintech_cams",
          filename: "completed-delete.pdf",
          fileHash: "f".repeat(64),
          status: "parsing"
        },
        tx
      )
    );
    await withTxn(testDb.db, async (tx) => {
      await batchRepo.markStaged(
        USER_ID,
        batch.id,
        { rowCount: 0, includedCount: 0, warningCount: 0, errorCount: 0 },
        {},
        "ready",
        tx
      );
      expect(await batchRepo.startCommitting(USER_ID, batch.id, tx)).toBe(true);
      await batchRepo.markCommitted(USER_ID, batch.id, tx);
    });

    await expect(service.deleteBatch(USER_ID, batch.id)).rejects.toThrow(
      'Batch cannot be deleted in status "completed"'
    );
    expect((await batchRepo.findById(USER_ID, batch.id))?.status).toBe("completed");
  });
});
