import { createHash } from "node:crypto";

import { Inject, Injectable } from "@nestjs/common";
import {
  ALLOWED_IMPORT_FILE_EXTENSIONS,
  ALLOWED_IMPORT_MIME_TYPES,
  MAX_IMPORT_FILE_SIZE_BYTES,
  MAX_IMPORT_ROWS
} from "@treasury-ops/shared";
import type {
  AccountId,
  CategoryKind,
  ColumnMapping,
  ImportBatch,
  ImportBatchId,
  ImportBatchStats,
  ParsedRow,
  StagedRow,
  StagedRowId,
  StagedRowPage,
  UpdateStagedRow
} from "@treasury-ops/shared";
import { parse } from "csv-parse/sync";
import { z } from "zod";

import { AccountRepository } from "../accounts/account.repository.js";
import { AuditRepository } from "../audit/audit.repository.js";
import { CategoryRepository } from "../categories/category.repository.js";
import { CategoryRuleRepository } from "../category-rules/category-rule.repository.js";
import { suggestCategory } from "../category-rules/suggest-category.js";
import { DATABASE_CONNECTION } from "../common/db/db.module.js";
import type { DrizzleDb } from "../common/db/db.module.js";
import { withTxn } from "../common/db/db-txn.js";
import { CategoryKindMismatchError } from "../common/errors/category-kind-mismatch.error.js";
import { EntityNotFoundError } from "../common/errors/entity-not-found.error.js";
import { ImportAlreadyCommittedError } from "../common/errors/import-already-committed.error.js";
import { ImportBatchNotReadyError } from "../common/errors/import-batch-not-ready.error.js";
import { InvalidImportFileError } from "../common/errors/invalid-import-file.error.js";
import { TransactionRepository } from "../transactions/transaction.repository.js";
import { computeDedupeHash } from "./dedupe-hash.js";
import { ImportBatchRepository } from "./import-batch.repository.js";
import { ImportsQueue } from "./imports.queue.js";
import { parseCsvRow } from "./parse-csv-row.js";
import { StagedRowRepository } from "./staged-row.repository.js";
import type { NewStagedRow } from "./staged-row.repository.js";

const STAGED_ROW_INSERT_CHUNK_SIZE = 200;
const COMMIT_CHUNK_SIZE = 200;
const REVERT_CHUNK_SIZE = 200;

const RawCsvRecordsSchema = z.array(z.record(z.string(), z.string()));

@Injectable()
export class ImportsService {
  constructor(
    @Inject(DATABASE_CONNECTION) private readonly db: DrizzleDb,
    private readonly batches: ImportBatchRepository,
    private readonly stagedRows: StagedRowRepository,
    private readonly transactions: TransactionRepository,
    private readonly accounts: AccountRepository,
    private readonly categories: CategoryRepository,
    private readonly audit: AuditRepository,
    private readonly categoryRules: CategoryRuleRepository,
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
    const [rules, activeCategories] = await Promise.all([
      this.categoryRules.list(userId),
      this.categories.list(userId)
    ]);
    const categoryKinds = new Map(
      activeCategories.map((category) => [category.id, category.kind] as const)
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
      const suggestedCategoryId = suggestCategory(
        row.parsed.description,
        rules.filter((rule) => categoryKinds.get(rule.categoryId) === row.parsed.type)
      );

      return {
        rowNumber: row.rowNumber,
        raw: row.raw,
        parsed: row.parsed,
        dedupeHash: row.dedupeHash,
        ...(suggestedCategoryId === undefined ? {} : { suggestedCategoryId }),
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

  /** The mapping form's pre-fill — the most recent batch's mapping for this account, or null. */
  async getSavedMapping(userId: string, accountId: AccountId): Promise<ColumnMapping | null> {
    if (!(await this.accounts.exists(userId, accountId))) {
      throw new EntityNotFoundError("Account");
    }
    return this.batches.findLatestMappingForAccount(userId, accountId);
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

    if (patch.suggestedCategoryId !== undefined && patch.suggestedCategoryId !== null) {
      const [row, category] = await Promise.all([
        this.stagedRows.findById(batchId, rowId),
        this.categories.findActiveById(userId, patch.suggestedCategoryId)
      ]);
      if (row === null) throw new EntityNotFoundError("Staged row");
      if (category === null) throw new EntityNotFoundError("Category");
      if (row.parsed !== undefined && category.kind !== row.parsed.type) {
        throw new CategoryKindMismatchError();
      }
    }

    const updated = await this.stagedRows.updateRow(batchId, rowId, patch);
    if (updated === null) throw new EntityNotFoundError("Staged row");
    return updated;
  }

  /**
   * Chunks of 200 rows, each chunk = one Postgres transaction (insert +
   * balance update + stats + audit), per BACKEND.md §4. Resumable: rows
   * whose dedupeHash already landed (from a previous, interrupted run) are
   * pre-filtered out via the same bulk findExistingDedupeHashes query the
   * parse job uses, so re-invoking a partially-committed batch only
   * processes what's left — never double-posts. The batch stays "staged"
   * for the whole run and only flips to "committed" once every includable
   * row has landed; a crash mid-run leaves it "staged" with partial
   * transactions, exactly as designed.
   */
  async commitBatch(userId: string, batchId: ImportBatchId): Promise<ImportBatch> {
    const batch = await this.batches.findById(userId, batchId);
    if (batch === null) throw new EntityNotFoundError("Import batch");
    if (batch.status !== "staged") {
      throw new ImportBatchNotReadyError(
        `Only a staged batch can be committed (current status: "${batch.status}").`
      );
    }

    const includable = await this.stagedRows.findIncludableForBatch(batchId);
    const candidateHashes = includable
      .map((row) => row.dedupeHash)
      .filter((hash): hash is string => hash !== undefined);
    const alreadyLanded = await this.transactions.findExistingDedupeHashes(userId, candidateHashes);
    const remaining = includable.filter(
      (row) => row.dedupeHash !== undefined && !alreadyLanded.has(row.dedupeHash)
    );
    const activeCategories = await this.categories.list(userId);
    const categoryKinds = new Map(
      activeCategories.map((category) => [category.id, category.kind] as const)
    );

    for (let start = 0; start < remaining.length; start += COMMIT_CHUNK_SIZE) {
      const chunk = remaining.slice(start, start + COMMIT_CHUNK_SIZE);
      const rows = chunk.map((row) => toCommitRow(row));
      for (const row of rows) {
        if (row.categoryId !== undefined) {
          assertCategoryKind(categoryKinds, row.categoryId, row.type);
        }
      }
      const netMinor = rows.reduce(
        (sum, row) => sum + (row.type === "income" ? row.amountMinor : -row.amountMinor),
        0
      );

      await withTxn(this.db, async (tx) => {
        await this.transactions.insertImportedRows(userId, batch.accountId, batchId, rows, tx);
        if (netMinor !== 0) {
          const applied = await this.accounts.applyBalanceDelta(
            userId,
            batch.accountId,
            netMinor,
            tx
          );
          if (!applied) throw new EntityNotFoundError("Account");
        }
        await this.audit.record(userId, "import.commit", batchId, tx, {
          chunkSize: chunk.length,
          netMinor
        });
        await this.batches.incrementCommittedCount(batchId, chunk.length, tx);
      });
    }

    await this.batches.markCommitted(batchId);
    const committed = await this.batches.findById(userId, batchId);
    if (committed === null) throw new EntityNotFoundError("Import batch");
    return committed;
  }

  /**
   * One bulk reversal, chunked transactions, reverses every posted
   * transaction with this batchId, per BACKEND.md §4. Naturally resumable
   * without any dedupe bookkeeping: each chunk marks its originals
   * "reversed" inside the same transaction as the reversal insert + balance
   * $inc, so a re-invoked revert's findPostedByImportBatchId query simply
   * no longer returns whatever already landed.
   */
  async revertBatch(userId: string, batchId: ImportBatchId): Promise<ImportBatch> {
    const batch = await this.batches.findById(userId, batchId);
    if (batch === null) throw new EntityNotFoundError("Import batch");
    if (batch.status !== "committed") {
      throw new ImportBatchNotReadyError(
        `Only a committed batch can be reverted (current status: "${batch.status}").`
      );
    }

    const posted = await this.transactions.findPostedByImportBatchId(userId, batchId);

    for (let start = 0; start < posted.length; start += REVERT_CHUNK_SIZE) {
      const chunk = posted.slice(start, start + REVERT_CHUNK_SIZE);
      const netMinor = chunk.reduce(
        (sum, original) =>
          sum + (original.type === "expense" ? original.amountMinor : -original.amountMinor),
        0
      );

      await withTxn(this.db, async (tx) => {
        await this.transactions.insertBulkReversals(userId, chunk, tx);
        if (netMinor !== 0) {
          const applied = await this.accounts.applyReversalBalanceDelta(
            userId,
            batch.accountId,
            netMinor,
            tx
          );
          if (!applied) throw new EntityNotFoundError("Account");
        }
        await this.audit.record(userId, "import.revert", batchId, tx, {
          chunkSize: chunk.length,
          netMinor
        });
      });
    }

    await this.batches.markReverted(batchId);
    const reverted = await this.batches.findById(userId, batchId);
    if (reverted === null) throw new EntityNotFoundError("Import batch");
    return reverted;
  }
}

function toCommitRow(row: StagedRow): ParsedRow & { dedupeHash: string; categoryId?: string } {
  if (row.parsed === undefined || row.dedupeHash === undefined) {
    throw new Error(
      `Staged row ${row.id} is marked includable but is missing its parsed data or dedupeHash — ` +
        "this should be impossible by construction (parseFile only ever sets include: true " +
        "alongside a successful parse)."
    );
  }
  return {
    ...row.parsed,
    dedupeHash: row.dedupeHash,
    ...(row.suggestedCategoryId === undefined ? {} : { categoryId: row.suggestedCategoryId })
  };
}

function assertCategoryKind(
  categoryKinds: ReadonlyMap<string, CategoryKind>,
  categoryId: string,
  transactionType: CategoryKind
): void {
  const categoryKind = categoryKinds.get(categoryId);
  if (categoryKind === undefined) throw new EntityNotFoundError("Category");
  if (categoryKind !== transactionType) throw new CategoryKindMismatchError();
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
