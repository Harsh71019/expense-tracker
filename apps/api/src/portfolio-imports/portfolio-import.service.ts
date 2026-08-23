import { createHash } from "node:crypto";

import { Inject, Injectable } from "@nestjs/common";
import {
  MAX_PORTFOLIO_IMPORT_FILE_SIZE_BYTES,
  type PortfolioImportBatch,
  type PortfolioImportBatchId,
  type PortfolioImportRow,
  type PortfolioImportRowId,
  type PortfolioImportRowPage,
  type PortfolioImportSource,
  type PortfolioImportStatus,
  type UpdatePortfolioImportRow
} from "@treasury-ops/shared";

import { AssetMarketRepository } from "../assets/asset-market.repository.js";
import { AssetRepository } from "../assets/asset.repository.js";
import { AuditRepository } from "../audit/audit.repository.js";
import { DATABASE_CONNECTION, type DrizzleDb } from "../common/db/db.module.js";
import { withTxn } from "../common/db/db-txn.js";
import { EntityNotFoundError } from "../common/errors/entity-not-found.error.js";
import {
  DuplicatePortfolioImportError,
  InvalidPdfError,
  PortfolioImportStateConflictError,
  PortfolioImportTooLargeError
} from "../common/errors/portfolio-import.error.js";
import { CasPdfExtractor } from "./cas-pdf-extractor.js";
import { KfintechCamsCasParser } from "./kfintech-cams-cas-parser.js";
import { PortfolioImportBatchRepository } from "./portfolio-import-batch.repository.js";
import { PortfolioImportEncryptionService } from "./portfolio-import-encryption.service.js";
import { PortfolioImportMatcherService } from "./portfolio-import-matcher.service.js";
import { PortfolioImportPayloadRepository } from "./portfolio-import-payload.repository.js";
import { PortfolioImportsQueue } from "./portfolio-import.queue.js";
import { PortfolioImportRowRepository } from "./portfolio-import-row.repository.js";

const PAYLOAD_TTL_MS = 60 * 60_000; // 1 hour
const CHUNK_SIZE = 200;
const PDF_MAGIC_BYTES = [0x25, 0x50, 0x44, 0x46, 0x2d]; // %PDF-

@Injectable()
export class PortfolioImportService {
  private readonly extractor = new CasPdfExtractor();
  private readonly parser = new KfintechCamsCasParser();

  constructor(
    @Inject(DATABASE_CONNECTION) private readonly db: DrizzleDb,
    private readonly batches: PortfolioImportBatchRepository,
    private readonly payloads: PortfolioImportPayloadRepository,
    private readonly rows: PortfolioImportRowRepository,
    private readonly encryption: PortfolioImportEncryptionService,
    private readonly matcher: PortfolioImportMatcherService,
    private readonly assets: AssetRepository,
    private readonly market: AssetMarketRepository,
    private readonly audit: AuditRepository,
    private readonly queue: PortfolioImportsQueue
  ) {}

  async createBatch(
    userId: string,
    filename: string,
    mimetype: string,
    buffer: Buffer,
    password?: string,
    source: PortfolioImportSource = "kfintech_cams",
    correlationId: string = crypto.randomUUID()
  ): Promise<PortfolioImportBatch> {
    assertValidPdfUpload(filename, mimetype, buffer);

    const fileHash = createHash("sha256").update(buffer).digest("hex");
    const existingActive = await this.batches.findActiveByFileHash(userId, fileHash);
    if (existingActive !== null) {
      throw new DuplicatePortfolioImportError();
    }

    const sealedFile = this.encryption.seal(buffer);
    const sealedPassword =
      password !== undefined && password.trim().length > 0
        ? this.encryption.seal(Buffer.from(password.trim(), "utf-8"))
        : undefined;

    const expiresAt = new Date(Date.now() + PAYLOAD_TTL_MS);

    const batch = await withTxn(this.db, async (tx) => {
      const createdBatch = await this.batches.create(
        userId,
        { source, filename, fileHash, status: "queued" },
        tx
      );
      await this.payloads.create(
        userId,
        {
          batchId: createdBatch.id,
          sealedFile,
          sealedPassword,
          expiresAt
        },
        tx
      );
      await this.audit.record(userId, "portfolio_import.upload", createdBatch.id, tx, {
        filename,
        source
      });
      return createdBatch;
    });

    await this.queue.enqueue({ batchId: batch.id, userId, correlationId });
    return batch;
  }

  async processQueuedBatch(batchId: PortfolioImportBatchId, userId: string): Promise<void> {
    const leaseOwner = crypto.randomUUID();
    const leaseUntil = new Date(Date.now() + 5 * 60_000);

    const claimed = await withTxn(this.db, (tx) =>
      this.batches.startParsing(userId, batchId, leaseOwner, leaseUntil, tx)
    );
    if (!claimed) return;

    try {
      const payload = await this.payloads.findByBatchId(userId, batchId);
      if (payload === null || payload.expiresAt < new Date()) {
        throw new Error("Portfolio import payload has expired or is missing.");
      }

      const fileBytes = this.encryption.open(payload.sealedFile);
      const password =
        payload.sealedPassword === undefined
          ? undefined
          : this.encryption.open(payload.sealedPassword).toString("utf-8");

      const text = await this.extractor.extractText(fileBytes, password);
      const parsedRows = this.parser.parse(text);

      const existingAssets = await this.assets.list(userId);
      const activeLinks = (
        await Promise.all(
          existingAssets.map((asset) => this.market.findActiveLinkByAssetId(userId, asset.id))
        )
      ).filter((link): link is NonNullable<typeof link> => link !== null);

      const matchedRows = this.matcher.matchRows(parsedRows, existingAssets, activeLinks);

      const needsConfirmation = matchedRows.some(
        (row) => row.matchStatus === "needs_confirmation" || row.matchStatus === "unmatched"
      );
      const finalStatus = needsConfirmation ? "needs_review" : "ready";

      const counts = {
        rowCount: matchedRows.length,
        includedCount: matchedRows.filter((row) => row.include).length,
        warningCount: matchedRows.filter((row) => row.warningCode !== undefined).length,
        errorCount: 0
      };

      await withTxn(this.db, async (tx) => {
        await this.rows.deleteAllForBatch(userId, batchId, tx);
        for (let start = 0; start < matchedRows.length; start += CHUNK_SIZE) {
          await this.rows.insertChunk(
            userId,
            batchId,
            matchedRows.slice(start, start + CHUNK_SIZE),
            tx
          );
        }
        await this.batches.markStaged(userId, batchId, counts, {}, finalStatus, tx);
        await this.payloads.deleteByBatchId(userId, batchId, tx);
        await this.audit.record(userId, "portfolio_import.stage", batchId, tx, {
          rowCount: counts.rowCount,
          status: finalStatus
        });
      });
    } catch (error: unknown) {
      const failureCode = determineFailureCode(error);
      await withTxn(this.db, async (tx) => {
        await this.batches.markFailed(userId, batchId, failureCode, tx);
        await this.payloads.deleteByBatchId(userId, batchId, tx);
      });
      throw error;
    }
  }

  async markJobFailed(
    batchId: PortfolioImportBatchId,
    userId: string,
    error: unknown
  ): Promise<void> {
    const failureCode = determineFailureCode(error);
    await withTxn(this.db, async (tx) => {
      await this.batches.markFailed(userId, batchId, failureCode, tx);
      await this.payloads.deleteByBatchId(userId, batchId, tx);
    });
  }

  async getBatch(userId: string, batchId: PortfolioImportBatchId): Promise<PortfolioImportBatch> {
    const batch = await this.batches.findById(userId, batchId);
    if (batch === null) throw new EntityNotFoundError("Portfolio import batch");
    return batch;
  }

  async listBatches(userId: string): Promise<PortfolioImportBatch[]> {
    return this.batches.list(userId);
  }

  async getRowsPage(
    userId: string,
    batchId: PortfolioImportBatchId,
    cursor: string | undefined,
    limit: number
  ): Promise<PortfolioImportRowPage> {
    const batch = await this.batches.findById(userId, batchId);
    if (batch === null) throw new EntityNotFoundError("Portfolio import batch");
    return this.rows.findPageByBatch(userId, batchId, cursor, limit);
  }

  async updateRow(
    userId: string,
    batchId: PortfolioImportBatchId,
    rowId: PortfolioImportRowId,
    patch: UpdatePortfolioImportRow
  ): Promise<PortfolioImportRow> {
    const batch = await this.batches.findById(userId, batchId);
    if (batch === null) throw new EntityNotFoundError("Portfolio import batch");
    if (batch.status !== "needs_review" && batch.status !== "ready") {
      throw new PortfolioImportStateConflictError("Only batches in review state can be updated.");
    }

    const updatedRow = await this.rows.updateReviewState(userId, batchId, rowId, patch);
    if (updatedRow === null) throw new EntityNotFoundError("Portfolio import row");

    const allRows = await this.rows.listAllForBatch(userId, batchId);
    const includedCount = allRows.filter((row) => row.include).length;
    const warningCount = allRows.filter((row) => row.warningCode !== null).length;

    await this.batches.updateCounts(userId, batchId, includedCount, warningCount);
    return updatedRow;
  }

  private async waitForBatchStatus(
    userId: string,
    batchId: PortfolioImportBatchId,
    targetStatus: PortfolioImportStatus,
    transientStatus: PortfolioImportStatus
  ): Promise<PortfolioImportBatch | null> {
    for (let i = 0; i < 50; i++) {
      await new Promise((resolve) => setTimeout(resolve, 100));
      const current = await this.batches.findById(userId, batchId);
      if (current?.status === targetStatus) return current;
      if (current !== null && current.status !== transientStatus) return null;
    }
    const finalCheck = await this.batches.findById(userId, batchId);
    return finalCheck?.status === targetStatus ? finalCheck : null;
  }

  async commitBatch(
    userId: string,
    batchId: PortfolioImportBatchId
  ): Promise<PortfolioImportBatch> {
    const batch = await this.batches.findById(userId, batchId);
    if (batch === null) throw new EntityNotFoundError("Portfolio import batch");

    if (batch.status === "completed") return batch;
    if (batch.status === "committing") {
      const completed = await this.waitForBatchStatus(userId, batchId, "completed", "committing");
      if (completed !== null) return completed;
    }
    if (batch.status !== "ready" && batch.status !== "needs_review") {
      const fresh = await this.batches.findById(userId, batchId);
      if (fresh?.status === "completed") return fresh;
      if (fresh?.status === "committing") {
        const completed = await this.waitForBatchStatus(userId, batchId, "completed", "committing");
        if (completed !== null) return completed;
      }
      throw new PortfolioImportStateConflictError(
        `Batch cannot be committed in status "${fresh?.status ?? batch.status}".`
      );
    }

    const started = await withTxn(this.db, (tx) =>
      this.batches.startCommitting(userId, batchId, tx)
    );
    if (!started) {
      const completed = await this.waitForBatchStatus(userId, batchId, "completed", "committing");
      if (completed !== null) return completed;
      const current = await this.batches.findById(userId, batchId);
      if (current?.status === "completed") return current;
      throw new PortfolioImportStateConflictError("Concurrent commit in progress.");
    }

    const includableRows = await this.rows.listIncludableForBatch(userId, batchId);
    const createdAssetsByScheme = new Map<string, string>();

    for (let start = 0; start < includableRows.length; start += CHUNK_SIZE) {
      const chunk = includableRows.slice(start, start + CHUNK_SIZE);
      await withTxn(this.db, async (tx) => {
        for (const row of chunk) {
          const schemeKey = row.isin ?? row.displayName;
          let assetId = row.proposedAssetId ?? createdAssetsByScheme.get(schemeKey) ?? null;

          if (row.proposedAction === "create_asset" || assetId === null) {
            const created = await this.assets.create(
              userId,
              {
                kind: "investment",
                name: row.displayName,
                openedAt: row.occurredAt ?? new Date(),
                openingValueMinor: row.grossAmountMinor ?? 0
              },
              tx
            );
            await this.market.createLink(
              userId,
              {
                assetId: created.id,
                instrumentType: row.instrumentType,
                provider: "amfi",
                providerInstrumentId: row.isin ?? row.displayName,
                ...(row.isin !== null ? { isin: row.isin } : {}),
                ...(row.schemeCode !== null ? { schemeCode: row.schemeCode } : {}),
                quoteUnit: "fund_unit",
                autoValuationEnabled: true,
                effectiveFrom: row.occurredAt ?? new Date()
              },
              tx
            );
            assetId = created.id;
            createdAssetsByScheme.set(schemeKey, assetId);
            await this.rows.updateReviewState(
              userId,
              batchId,
              row.id,
              { proposedAssetId: assetId },
              tx
            );
          } else {
            const activeLink = await this.market.findActiveLinkByAssetId(userId, assetId, tx);
            if (activeLink === null) {
              await this.market.createLink(
                userId,
                {
                  assetId,
                  instrumentType: row.instrumentType,
                  provider: "amfi",
                  providerInstrumentId: row.isin ?? row.displayName,
                  ...(row.isin !== null ? { isin: row.isin } : {}),
                  ...(row.schemeCode !== null ? { schemeCode: row.schemeCode } : {}),
                  quoteUnit: "fund_unit",
                  autoValuationEnabled: true,
                  effectiveFrom: row.occurredAt ?? new Date()
                },
                tx
              );
            }
          }

          if (row.quantityMicroUnits !== null && row.quantityMicroUnits > 0) {
            const eventType = determineEventType(row.rowKind, row.transactionType);
            await this.market.createPositionEvent(
              userId,
              {
                assetId,
                eventType,
                quantityMicroUnits: row.quantityMicroUnits,
                ...(row.grossAmountMinor !== null
                  ? { grossAmountMinor: row.grossAmountMinor }
                  : {}),
                occurredAt: row.occurredAt ?? new Date(),
                source: "cas",
                sourceReference: `cas_batch_${batchId}_row_${row.rowNumber}`,
                portfolioImportRowId: row.id
              },
              tx
            );
          }
        }
      });
    }

    await withTxn(this.db, async (tx) => {
      await this.batches.markCommitted(userId, batchId, tx);
      await this.payloads.deleteByBatchId(userId, batchId, tx);
      await this.audit.record(userId, "portfolio_import.commit", batchId, tx, {
        committedRows: includableRows.length
      });
    });

    const completed = await this.batches.findById(userId, batchId);
    if (completed === null) throw new EntityNotFoundError("Portfolio import batch");
    return completed;
  }

  async revertBatch(
    userId: string,
    batchId: PortfolioImportBatchId
  ): Promise<PortfolioImportBatch> {
    const batch = await this.batches.findById(userId, batchId);
    if (batch === null) throw new EntityNotFoundError("Portfolio import batch");

    if (batch.status === "reverted") return batch;
    if (batch.status === "reverting") {
      const reverted = await this.waitForBatchStatus(userId, batchId, "reverted", "reverting");
      if (reverted !== null) return reverted;
    }
    if (batch.status !== "completed") {
      const fresh = await this.batches.findById(userId, batchId);
      if (fresh?.status === "reverted") return fresh;
      if (fresh?.status === "reverting") {
        const reverted = await this.waitForBatchStatus(userId, batchId, "reverted", "reverting");
        if (reverted !== null) return reverted;
      }
      throw new PortfolioImportStateConflictError(
        `Batch cannot be reverted in status "${fresh?.status ?? batch.status}".`
      );
    }

    const started = await withTxn(this.db, (tx) =>
      this.batches.startReverting(userId, batchId, tx)
    );
    if (!started) {
      const reverted = await this.waitForBatchStatus(userId, batchId, "reverted", "reverting");
      if (reverted !== null) return reverted;
      const current = await this.batches.findById(userId, batchId);
      if (current?.status === "reverted") return current;
      throw new PortfolioImportStateConflictError("Concurrent revert in progress.");
    }

    await withTxn(this.db, async (tx) => {
      const batchEvents = await this.market.listPositionEventsBySourceReferencePrefix(
        userId,
        `cas_batch_${batchId}_`,
        tx
      );

      for (const event of batchEvents) {
        if (event.eventType === "reversal") continue;
        const reversal = await this.market.findReversalForPositionEvent(userId, event.id, tx);
        if (reversal === null) {
          await this.market.createPositionEvent(
            userId,
            {
              assetId: event.assetId,
              eventType: "reversal",
              quantityMicroUnits: event.quantityMicroUnits,
              occurredAt: new Date(),
              source: "cas",
              sourceReference: `reversal_cas_batch_${batchId}_event_${event.id}`,
              reversalOf: event.id
            },
            tx
          );
        }
      }
      await this.batches.markReverted(userId, batchId, tx);
      await this.audit.record(userId, "portfolio_import.revert", batchId, tx);
    });

    const reverted = await this.batches.findById(userId, batchId);
    if (reverted === null) throw new EntityNotFoundError("Portfolio import batch");
    return reverted;
  }
}

function assertValidPdfUpload(filename: string, mimetype: string, buffer: Buffer): void {
  if (buffer.byteLength > MAX_PORTFOLIO_IMPORT_FILE_SIZE_BYTES) {
    throw new PortfolioImportTooLargeError();
  }
  if (
    mimetype !== "application/pdf" &&
    mimetype !== "application/x-pdf" &&
    !filename.toLowerCase().endsWith(".pdf")
  ) {
    throw new InvalidPdfError("The uploaded file must be a PDF document.");
  }
  if (buffer.byteLength < PDF_MAGIC_BYTES.length) {
    throw new InvalidPdfError("The uploaded file is too short to be a valid PDF.");
  }
  for (let i = 0; i < PDF_MAGIC_BYTES.length; i++) {
    if (buffer[i] !== PDF_MAGIC_BYTES[i]) {
      throw new InvalidPdfError("The uploaded file lacks a valid PDF magic header.");
    }
  }
}

function determineFailureCode(error: unknown): string {
  if (
    error !== null &&
    typeof error === "object" &&
    "code" in error &&
    typeof error.code === "string"
  ) {
    return error.code;
  }
  const message =
    error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  if (message.includes("password")) return "cas_password_invalid";
  if (message.includes("unsupported")) return "unsupported_cas_layout";
  if (message.includes("pdf")) return "invalid_pdf";
  return "portfolio_import_failed";
}

function determineEventType(
  rowKind: "holding" | "transaction",
  transactionType: string | null | undefined
):
  | "opening"
  | "purchase"
  | "reinvestment"
  | "switch_in"
  | "redemption"
  | "switch_out"
  | "reconciliation_in" {
  if (rowKind === "holding") return "reconciliation_in";
  switch (transactionType) {
    case "redemption":
      return "redemption";
    case "switch_out":
      return "switch_out";
    case "switch_in":
      return "switch_in";
    case "reinvestment":
      return "reinvestment";
    default:
      return "purchase";
  }
}
