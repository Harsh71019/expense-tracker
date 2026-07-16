import { createHash } from "node:crypto";

import { Injectable } from "@nestjs/common";
import {
  ALLOWED_IMPORT_FILE_EXTENSIONS,
  ALLOWED_IMPORT_MIME_TYPES,
  MAX_IMPORT_FILE_SIZE_BYTES,
  MAX_IMPORT_ROWS
} from "@vyaya/shared";
import type {
  AccountId,
  ColumnMapping,
  ImportBatch,
  ImportBatchId,
  ImportBatchStats,
  StagedRow,
  StagedRowId,
  StagedRowPage,
  UpdateStagedRow
} from "@vyaya/shared";
import { parse } from "csv-parse/sync";
import { z } from "zod";

import { EntityNotFoundError } from "../common/errors/entity-not-found.error.js";
import { ImportAlreadyCommittedError } from "../common/errors/import-already-committed.error.js";
import { InvalidImportFileError } from "../common/errors/invalid-import-file.error.js";
import { TransactionRepository } from "../transactions/transaction.repository.js";
import { computeDedupeHash } from "./dedupe-hash.js";
import { ImportBatchRepository } from "./import-batch.repository.js";
import { ImportsQueue } from "./imports.queue.js";
import { parseCsvRow } from "./parse-csv-row.js";
import { StagedRowRepository } from "./staged-row.repository.js";
import type { NewStagedRow } from "./staged-row.repository.js";

const STAGED_ROW_INSERT_CHUNK_SIZE = 200;

const RawCsvRecordsSchema = z.array(z.record(z.string(), z.string()));

@Injectable()
export class ImportsService {
  constructor(
    private readonly batches: ImportBatchRepository,
    private readonly stagedRows: StagedRowRepository,
    private readonly transactions: TransactionRepository,
    private readonly queue: ImportsQueue
  ) {}

  /**
   * Validates the uploaded file, rejects it if the exact same bytes were
   * already committed (BACKEND.md §4: "reject if fileHash already
   * committed" — narrower than "already uploaded": a staged, reverted, or
   * failed prior attempt at the same file must not block a fresh try, per
   * Gate 3's "revert the batch ... re-import -> clean"), creates the batch,
   * and enqueues the parse job. The actual parse happens off the request
   * cycle (ImportsProcessor).
   */
  async createBatch(
    userId: string,
    accountId: AccountId,
    filename: string,
    mimetype: string,
    buffer: Buffer,
    mapping: ColumnMapping
  ): Promise<ImportBatch> {
    assertValidImportFile(filename, mimetype, buffer);

    const fileHash = createHash("sha256").update(buffer).digest("hex");
    const existing = await this.batches.findByFileHash(userId, fileHash);
    if (existing !== null && existing.status === "committed") {
      throw new ImportAlreadyCommittedError();
    }

    const batch = await this.batches.create(userId, accountId, filename, fileHash, mapping);
    await this.queue.enqueueParse({
      batchId: batch.id,
      userId,
      accountId,
      mapping,
      fileContentBase64: buffer.toString("base64")
    });
    return batch;
  }

  /**
   * Parses a CSV file into staged_rows and flips the batch to "staged" (or
   * "failed" if the file itself doesn't parse as CSV at all — a per-row
   * problem never fails the batch, only a whole-file structural failure
   * does). Idempotent: always clears any staged_rows left by a previous,
   * incomplete attempt before re-deriving from the same file bytes, so a
   * BullMQ retry is safe.
   */
  async parseFile(
    batchId: ImportBatchId,
    userId: string,
    accountId: string,
    mapping: ColumnMapping,
    fileContent: string
  ): Promise<void> {
    await this.stagedRows.deleteAllForBatch(batchId);

    let records: Record<string, string>[];
    try {
      const raw: unknown = parse(fileContent, {
        columns: true,
        skip_empty_lines: true,
        trim: true
      });
      records = RawCsvRecordsSchema.parse(raw);
    } catch {
      await this.batches.markParsed(batchId, "failed", {
        total: 0,
        staged: 0,
        duplicates: 0,
        committed: 0
      });
      return;
    }

    const rows = records.map((raw, index) => {
      const rowNumber = index + 1;
      const { parsed, problems: readonlyProblems } = parseCsvRow(raw, mapping);
      const problems = [...readonlyProblems];
      if (parsed === undefined) {
        return { rowNumber, raw, problems, dedupeHash: undefined };
      }
      const dedupeHash = computeDedupeHash(
        userId,
        accountId,
        parsed.occurredAt,
        parsed.amountMinor,
        parsed.description
      );
      return { rowNumber, raw, parsed, problems, dedupeHash };
    });

    const candidateHashes = rows
      .map((row) => row.dedupeHash)
      .filter((hash): hash is string => hash !== undefined);
    const existingHashes = await this.transactions.findExistingDedupeHashes(
      userId,
      candidateHashes
    );

    const seenInFile = new Set<string>();
    let duplicates = 0;
    const stagedRows: NewStagedRow[] = rows.map((row) => {
      if (row.dedupeHash === undefined) {
        return {
          rowNumber: row.rowNumber,
          raw: row.raw,
          problems: row.problems,
          isDuplicate: false,
          include: false
        };
      }

      const isDuplicate = seenInFile.has(row.dedupeHash) || existingHashes.has(row.dedupeHash);
      seenInFile.add(row.dedupeHash);
      if (isDuplicate) duplicates += 1;

      return {
        rowNumber: row.rowNumber,
        raw: row.raw,
        parsed: row.parsed,
        dedupeHash: row.dedupeHash,
        problems: row.problems,
        isDuplicate,
        include: !isDuplicate
      };
    });

    for (let start = 0; start < stagedRows.length; start += STAGED_ROW_INSERT_CHUNK_SIZE) {
      await this.stagedRows.insertMany(
        batchId,
        stagedRows.slice(start, start + STAGED_ROW_INSERT_CHUNK_SIZE)
      );
    }

    const stats: ImportBatchStats = {
      total: stagedRows.length,
      staged: stagedRows.length,
      duplicates,
      committed: 0
    };
    await this.batches.markParsed(batchId, "staged", stats);
  }

  list(userId: string): Promise<ImportBatch[]> {
    return this.batches.list(userId);
  }

  async preview(
    userId: string,
    batchId: ImportBatchId,
    cursor: string | undefined,
    limit: number
  ): Promise<StagedRowPage> {
    const batch = await this.batches.findById(userId, batchId);
    if (batch === null) throw new EntityNotFoundError("Import batch");
    return this.stagedRows.findByBatchId(batchId, cursor, limit);
  }

  async updateRow(
    userId: string,
    batchId: ImportBatchId,
    rowId: StagedRowId,
    patch: UpdateStagedRow
  ): Promise<StagedRow> {
    const batch = await this.batches.findById(userId, batchId);
    if (batch === null) throw new EntityNotFoundError("Import batch");

    const updated = await this.stagedRows.updateRow(batchId, rowId, patch);
    if (updated === null) throw new EntityNotFoundError("Staged row");
    return updated;
  }
}

export function assertValidImportFile(filename: string, mimetype: string, buffer: Buffer): void {
  const extension = filename.slice(filename.lastIndexOf(".")).toLowerCase();
  if (!ALLOWED_IMPORT_FILE_EXTENSIONS.some((allowed) => allowed === extension)) {
    throw new InvalidImportFileError(
      `Unsupported file extension "${extension}". Only .csv files are accepted.`
    );
  }
  if (!ALLOWED_IMPORT_MIME_TYPES.some((allowed) => allowed === mimetype)) {
    throw new InvalidImportFileError(`Unsupported file type "${mimetype}".`);
  }
  if (buffer.length === 0) {
    throw new InvalidImportFileError("The uploaded file is empty.");
  }
  if (buffer.length > MAX_IMPORT_FILE_SIZE_BYTES) {
    throw new InvalidImportFileError(
      `File is ${buffer.length} bytes, exceeding the ${MAX_IMPORT_FILE_SIZE_BYTES}-byte cap.`
    );
  }

  // An approximate, cheap row count (newline count, not a full CSV parse) —
  // good enough for a safety cap; the real parse job counts exactly.
  const lineCount = buffer
    .toString("utf8")
    .split(/\r\n|\r|\n/)
    .filter((line) => line.trim() !== "").length;
  const approximateRowCount = Math.max(lineCount - 1, 0);
  if (approximateRowCount > MAX_IMPORT_ROWS) {
    throw new InvalidImportFileError(
      `File has approximately ${approximateRowCount} rows, exceeding the ${MAX_IMPORT_ROWS}-row cap.`
    );
  }
}
