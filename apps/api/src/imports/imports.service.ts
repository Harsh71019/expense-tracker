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
import { assertBalanceDeltaApplied } from "../accounts/balance-delta.js";
import { AuditRepository } from "../audit/audit.repository.js";
import { CategoryRepository } from "../categories/category.repository.js";
import { CategorySuggestionService } from "../category-rules/category-suggestion.service.js";
import { parseCsvRow } from "../common/csv/parse-csv-row.js";
import { DATABASE_CONNECTION } from "../common/db/db.module.js";
import type { DrizzleDb } from "../common/db/db.module.js";
import { withTxn } from "../common/db/db-txn.js";
import { isForeignKeyViolation, isUniqueViolation } from "../common/db/postgres-error.js";
import { CategoryKindMismatchError } from "../common/errors/category-kind-mismatch.error.js";
import { EntityNotFoundError } from "../common/errors/entity-not-found.error.js";
import { ImportAlreadyCommittedError } from "../common/errors/import-already-committed.error.js";
import { ImportBatchNotReadyError } from "../common/errors/import-batch-not-ready.error.js";
import { ImportFileTooLargeError } from "../common/errors/import-file-too-large.error.js";
import { InvalidImportFileError } from "../common/errors/invalid-import-file.error.js";
import { LoggingContextService } from "../common/logging/logging-context.service.js";
import { MetricsService } from "../common/observability/metrics.service.js";
import { addDaysUtc, istCalendarDateStartUtc } from "../common/time/ist.js";
import { TransactionRepository } from "../transactions/transaction.repository.js";
import { computeDedupeFingerprintV2 } from "./dedupe-fingerprint-v2.js";
import { computeDedupeHash } from "./dedupe-hash.js";
import {
  DELETABLE_IMPORT_BATCH_STATUSES,
  ImportBatchRepository
} from "./import-batch.repository.js";
import type { ImportWorkflowJobData } from "./import-workflow.js";
import {
  calendarDayDistance,
  evaluateNearDuplicates,
  NEAR_DUPLICATE_DAY_WINDOW,
  NEAR_DUPLICATE_RESOURCE_CONTRACT
} from "./near-duplicate-scoring.js";
import type { NearDuplicateCandidate } from "./near-duplicate-scoring.js";
import { StagedRowRepository } from "./staged-row.repository.js";
import type { NewStagedRow } from "./staged-row.repository.js";

const COMMIT_CONFLICT_MAX_ATTEMPTS = 2;

const STAGED_ROW_INSERT_CHUNK_SIZE = 200;
const COMMIT_CHUNK_SIZE = 200;
const REVERT_CHUNK_SIZE = 200;
const WORKFLOW_LEASE_MS = 5 * 60_000;
const WORKFLOW_RETRY_DELAY_MS = 60_000;

const RawCsvRecordsSchema = z.array(z.record(z.string(), z.string()));

type ParsedImportRow = Readonly<{
  rowNumber: number;
  raw: Record<string, string>;
  parsed?: ParsedRow | undefined;
  problems: readonly string[];
  dedupeHashV1?: string | undefined;
  dedupeFingerprintV2?: string | undefined;
}>;

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
    private readonly categorySuggestions: CategorySuggestionService,
    private readonly metrics: MetricsService,
    private readonly context: LoggingContextService = new LoggingContextService()
  ) {}

  /**
   * Validates the uploaded file, rejects it if the exact same bytes were
   * already committed (BACKEND.md §4: "reject if fileHash already
   * committed" — narrower than "already uploaded": a staged, reverted, or
   * failed prior attempt at the same file must not block a fresh try, per
   * Gate 3's "revert the batch ... re-import -> clean"), creates the batch,
   * and persists the parse command and bounded file payload in the same
   * transaction. A worker-only dispatcher later hands a pointer to BullMQ,
   * so an unavailable queue cannot strand an accepted upload.
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

    const correlationId = this.context.get()?.reqId ?? crypto.randomUUID();
    return withTxn(this.db, (tx) =>
      this.batches.create(userId, accountId, filename, fileHash, mapping, {
        fileContentBase64: buffer.toString("base64"),
        correlationId,
        tx
      })
    );
  }

  async runWorkflow(data: ImportWorkflowJobData): Promise<void> {
    const started = await this.batches.startWorkflow(
      data.userId,
      data.batchId,
      data.operation,
      data.claimToken,
      workflowLeaseUntil()
    );
    if (!started) return;

    const heartbeat = () =>
      this.batches.heartbeatWorkflow(
        data.userId,
        data.batchId,
        data.claimToken,
        workflowLeaseUntil()
      );

    if (data.operation === "parse") {
      const payload = await this.batches.findWorkflowPayload(data.userId, data.batchId);
      if (payload === null) throw new EntityNotFoundError("Import workflow payload");
      await this.parseFile(
        data.batchId,
        data.userId,
        payload.accountId,
        payload.mapping,
        Buffer.from(payload.fileContentBase64, "base64").toString("utf8"),
        data.claimToken,
        heartbeat
      );
      return;
    }
    if (data.operation === "commit") {
      await this.commitBatch(data.userId, data.batchId, data.claimToken, heartbeat);
      return;
    }
    await this.revertBatch(data.userId, data.batchId, data.claimToken, heartbeat);
  }

  async markWorkflowFailed(data: ImportWorkflowJobData, error: unknown): Promise<void> {
    await this.batches.failWorkflow(
      data.userId,
      data.batchId,
      data.operation,
      data.claimToken,
      errorSummary(error),
      new Date(Date.now() + WORKFLOW_RETRY_DELAY_MS)
    );
  }

  async markTerminalParseFailure(userId: string, batchId: ImportBatchId): Promise<void> {
    await this.batches.markTerminalParseFailure(userId, batchId);
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
    fileContent: string,
    claimToken?: string,
    heartbeat?: () => Promise<boolean>
  ): Promise<void> {
    await assertWorkflowLease(heartbeat);
    await this.stagedRows.deleteAllForBatch(userId, batchId);

    let records: Record<string, string>[];
    try {
      const raw: unknown = parse(fileContent, {
        columns: true,
        skip_empty_lines: true,
        trim: true
      });
      records = RawCsvRecordsSchema.parse(raw);
    } catch {
      const failedStats = {
        total: 0,
        staged: 0,
        duplicates: 0,
        committed: 0
      } as const;
      if (claimToken === undefined) {
        await this.batches.markParsed(userId, batchId, "failed", failedStats);
      } else {
        await assertWorkflowLease(heartbeat);
        await this.batches.completeWorkflow(
          userId,
          batchId,
          "parse",
          claimToken,
          "failed",
          failedStats
        );
      }
      return;
    }

    const rows = records.map((raw, index) => {
      const rowNumber = index + 1;
      const { parsed, problems: readonlyProblems } = parseCsvRow(raw, mapping);
      const problems = [...readonlyProblems];
      if (parsed === undefined) {
        return { rowNumber, raw, parsed, problems };
      }
      const dedupeHashV1 = computeDedupeHash(
        userId,
        accountId,
        parsed.occurredAt,
        parsed.amountMinor,
        parsed.description
      );
      const dedupeFingerprintV2 = computeDedupeFingerprintV2(
        userId,
        accountId,
        parsed.type,
        parsed.occurredAt,
        parsed.amountMinor,
        parsed.description
      );
      return { rowNumber, raw, parsed, problems, dedupeHashV1, dedupeFingerprintV2 };
    });

    const candidateFingerprintsV2 = rows.flatMap((row) =>
      row.parsed === undefined ? [] : [row.dedupeFingerprintV2]
    );
    const candidateHashesV1 = rows.flatMap((row) =>
      row.parsed === undefined ? [] : [row.dedupeHashV1]
    );
    const [existingFingerprintsV2, existingLegacyHashes] = await Promise.all([
      this.transactions.findExistingDedupeFingerprintsV2(userId, candidateFingerprintsV2),
      this.transactions.findExistingDedupeHashes(userId, candidateHashesV1)
    ]);
    const activeCategories = await this.categories.list(userId);
    const suggestions = await this.categorySuggestions.suggestMany(
      userId,
      rows.flatMap((row) =>
        row.parsed === undefined
          ? []
          : [
              {
                description: row.parsed.description,
                occurredAt: row.parsed.occurredAt,
                type: row.parsed.type
              }
            ]
      ),
      activeCategories
    );

    const seenInFile = new Set<string>();
    let duplicates = 0;
    let suggestionIndex = 0;
    const stagedRows: NewStagedRow[] = rows.map((row) => {
      if (row.parsed === undefined) {
        return {
          rowNumber: row.rowNumber,
          raw: row.raw,
          problems: row.problems,
          isDuplicate: false,
          include: false
        };
      }

      // Exact duplicate: type-aware v2 fingerprint first (against both this
      // file and every prior v2-populated transaction), then a type-filtered
      // fallback against legacy v1-only rows so pre-migration data is never
      // silently reinterpreted or double-posted.
      const isDuplicate =
        seenInFile.has(row.dedupeFingerprintV2) ||
        existingFingerprintsV2.has(row.dedupeFingerprintV2) ||
        existingLegacyHashes.get(row.dedupeHashV1) === row.parsed.type;
      seenInFile.add(row.dedupeFingerprintV2);
      if (isDuplicate) duplicates += 1;
      const categorySuggestion = suggestions[suggestionIndex];
      suggestionIndex += 1;

      return {
        rowNumber: row.rowNumber,
        raw: row.raw,
        parsed: row.parsed,
        dedupeFingerprintV2: row.dedupeFingerprintV2,
        ...(categorySuggestion === undefined
          ? {}
          : {
              suggestedCategoryId: categorySuggestion.categoryId,
              categorySuggestion
            }),
        problems: row.problems,
        isDuplicate,
        include: !isDuplicate
      };
    });

    await this.attachNearDuplicateEvidence(userId, accountId, rows, stagedRows);

    for (let start = 0; start < stagedRows.length; start += STAGED_ROW_INSERT_CHUNK_SIZE) {
      await assertWorkflowLease(heartbeat);
      await this.stagedRows.insertMany(
        userId,
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
    if (claimToken === undefined) {
      await this.batches.markParsed(userId, batchId, "staged", stats);
    } else {
      await assertWorkflowLease(heartbeat);
      await this.batches.completeWorkflow(userId, batchId, "parse", claimToken, "staged", stats);
    }
    this.metrics.recordCategorySuggestions("suggested", suggestions.filter(Boolean).length);
  }

  /**
   * Strict blocking before approximate comparison: one bounded, tenant-scoped
   * window query covers the whole file (not one query per row), then each
   * non-exact-duplicate row is scored only against candidates that also
   * share its exact type + amount and fall within the narrow calendar-day
   * window. This is advisory review evidence only — it never flips
   * `include`/`isDuplicate`, never mutates a ledger entry, and abstains
   * (leaves `nearDuplicateResult` unset) rather than guessing.
   */
  private async attachNearDuplicateEvidence(
    userId: string,
    accountId: string,
    rows: readonly ParsedImportRow[],
    stagedRows: NewStagedRow[]
  ): Promise<void> {
    const scorable = rows.flatMap((row, index) => {
      const stagedRow = stagedRows[index];
      if (row.parsed === undefined || stagedRow === undefined || stagedRow.isDuplicate) return [];
      return [
        {
          index,
          type: row.parsed.type,
          amountMinor: row.parsed.amountMinor,
          occurredAt: row.parsed.occurredAt,
          description: row.parsed.description
        }
      ];
    });
    if (scorable.length === 0) return;

    const { start, end } = candidateWindowBounds(scorable.map((row) => row.occurredAt));
    const candidates = await this.transactions.findNearDuplicateCandidateWindow(
      userId,
      accountId,
      start,
      end,
      NEAR_DUPLICATE_RESOURCE_CONTRACT.maxRows
    );

    const byTypeAndAmount = new Map<string, NearDuplicateCandidate[]>();
    for (const candidate of candidates) {
      const key = `${candidate.type}|${candidate.amountMinor}`;
      const bucket = byTypeAndAmount.get(key) ?? [];
      bucket.push({
        transactionId: candidate.transactionId,
        description: candidate.description,
        source: candidate.source,
        occurredAt: candidate.occurredAt
      });
      byTypeAndAmount.set(key, bucket);
    }

    for (const row of scorable) {
      const bucket = byTypeAndAmount.get(`${row.type}|${row.amountMinor}`) ?? [];
      const blocked = bucket.filter(
        (candidate) =>
          calendarDayDistance(row.occurredAt, candidate.occurredAt) <= NEAR_DUPLICATE_DAY_WINDOW
      );
      const result = evaluateNearDuplicates(
        { description: row.description, occurredAt: row.occurredAt },
        blocked
      );
      if (result.outcome === "abstained") continue;
      const stagedRow = stagedRows[row.index];
      if (stagedRow !== undefined) stagedRow.nearDuplicateResult = result;
    }
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
    return this.stagedRows.findByBatchId(userId, batchId, cursor, limit);
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
        this.stagedRows.findById(userId, batchId, rowId),
        this.categories.findActiveById(userId, patch.suggestedCategoryId)
      ]);
      if (row === null) throw new EntityNotFoundError("Staged row");
      if (category === null) throw new EntityNotFoundError("Category");
      if (row.parsed !== undefined && category.kind !== row.parsed.type) {
        throw new CategoryKindMismatchError();
      }
    }

    const updated = await this.stagedRows.updateRow(userId, batchId, rowId, patch);
    if (updated === null) throw new EntityNotFoundError("Staged row");
    return updated;
  }

  async requestCommit(userId: string, batchId: ImportBatchId): Promise<ImportBatch> {
    const batch = await this.batches.findById(userId, batchId);
    if (batch === null) throw new EntityNotFoundError("Import batch");
    if (
      batch.status === "committed" ||
      batch.status === "commit_queued" ||
      batch.status === "committing"
    ) {
      return batch;
    }
    if (batch.status !== "staged" && batch.status !== "failed") {
      throw new ImportBatchNotReadyError(
        `Only a staged batch can be queued for commit (current status: "${batch.status}").`
      );
    }
    const queuedWorkflow = await this.batches.queueWorkflow(
      userId,
      batchId,
      "commit",
      this.context.get()?.reqId ?? crypto.randomUUID()
    );
    if (!queuedWorkflow) return this.getConcurrentWorkflow(userId, batchId, "commit");
    const queued = await this.batches.findById(userId, batchId);
    if (queued === null) throw new EntityNotFoundError("Import batch");
    return queued;
  }

  async requestRevert(userId: string, batchId: ImportBatchId): Promise<ImportBatch> {
    const batch = await this.batches.findById(userId, batchId);
    if (batch === null) throw new EntityNotFoundError("Import batch");
    if (
      batch.status === "reverted" ||
      batch.status === "revert_queued" ||
      batch.status === "reverting"
    ) {
      return batch;
    }
    if (batch.status !== "committed" && batch.status !== "failed") {
      throw new ImportBatchNotReadyError(
        `Only a committed batch can be queued for revert (current status: "${batch.status}").`
      );
    }
    const queuedWorkflow = await this.batches.queueWorkflow(
      userId,
      batchId,
      "revert",
      this.context.get()?.reqId ?? crypto.randomUUID()
    );
    if (!queuedWorkflow) return this.getConcurrentWorkflow(userId, batchId, "revert");
    const queued = await this.batches.findById(userId, batchId);
    if (queued === null) throw new EntityNotFoundError("Import batch");
    return queued;
  }

  /**
   * A batch is only deletable while nothing it did is live: never
   * "committed" or "reverted" (both have real ledger rows — originals and,
   * for reverted, their compensating reversals too — still pointing at this
   * batch via `transactions.import_batch_id`; the ledger is append-only, so
   * those rows are never deleted) and never mid-workflow (a delete racing a
   * worker's claim could strand it). Deleting removes the batch's staged
   * rows and its own row; it leaves no trace for a status that never posted
   * anything, which is the point.
   */
  async deleteBatch(userId: string, batchId: ImportBatchId): Promise<void> {
    const batch = await this.batches.findById(userId, batchId);
    if (batch === null) throw new EntityNotFoundError("Import batch");
    if (!isDeletableStatus(batch.status)) {
      throw new ImportBatchNotReadyError(
        `Only a non-committed, non-in-progress batch can be deleted (current status: "${batch.status}").`
      );
    }

    let deleted: boolean;
    try {
      deleted = await withTxn(this.db, async (tx) => {
        await this.stagedRows.deleteAllForBatch(userId, batchId, tx);
        return this.batches.delete(userId, batchId, tx);
      });
    } catch (error) {
      // A "staged" batch can carry partial ledger rows from an interrupted
      // commit run (commitBatch's own doc comment: it stays "staged" until
      // every includable row has landed). Those rows still reference this
      // batch, so the FK rejects the delete — surface it as the same
      // domain error as any other not-yet-safe-to-delete batch.
      if (isForeignKeyViolation(error)) {
        throw new ImportBatchNotReadyError(
          "This batch has posted transactions still referencing it and can't be deleted."
        );
      }
      throw error;
    }
    if (!deleted) {
      throw new ImportBatchNotReadyError(
        "The batch's status changed before the delete could complete."
      );
    }
  }

  /**
   * Chunks of 200 rows, each chunk = one Postgres transaction (insert +
   * balance update + stats + audit), per BACKEND.md §4. Resumable: rows
   * whose v2 fingerprint already landed (from a previous, interrupted run)
   * are pre-filtered out via the same bulk findExistingDedupeFingerprintsV2
   * query the parse job uses, so re-invoking a partially-committed batch
   * only processes what's left — never double-posts. The batch stays
   * "staged" for the whole run and only flips to "committed" once every
   * includable row has landed; a crash mid-run leaves it "staged" with
   * partial transactions, exactly as designed.
   *
   * The pre-filter is a check-then-insert race window, not a guarantee: two
   * raw concurrent commitBatch calls for the same batch can both pass it.
   * The per-chunk insert is additionally guarded by the
   * `transactions_user_id_dedupe_fingerprint_v2_unique` index — on conflict,
   * the chunk is re-filtered against what actually landed and retried once,
   * so identical parallel commit attempts still produce exactly one ledger
   * effect (see the "idempotent under concurrent commit" integration test).
   */
  async commitBatch(
    userId: string,
    batchId: ImportBatchId,
    claimToken?: string,
    heartbeat?: () => Promise<boolean>
  ): Promise<ImportBatch> {
    const batch = await this.batches.findById(userId, batchId);
    if (batch === null) throw new EntityNotFoundError("Import batch");
    if (batch.status !== "staged" && batch.status !== "committing") {
      throw new ImportBatchNotReadyError(
        `Only a staged batch can be committed (current status: "${batch.status}").`
      );
    }

    await assertWorkflowLease(heartbeat);
    const includable = await this.stagedRows.findIncludableForBatch(userId, batchId);
    const candidateFingerprints = includable
      .map((row) => row.dedupeFingerprintV2)
      .filter((fingerprint): fingerprint is string => fingerprint !== undefined);
    const alreadyLanded = await this.transactions.findExistingDedupeFingerprintsV2(
      userId,
      candidateFingerprints
    );
    const remaining = includable.filter(
      (row) => row.dedupeFingerprintV2 !== undefined && !alreadyLanded.has(row.dedupeFingerprintV2)
    );
    const activeCategories = await this.categories.list(userId);
    const categoryKinds = new Map(
      activeCategories.map((category) => [category.id, category.kind] as const)
    );

    for (let start = 0; start < remaining.length; start += COMMIT_CHUNK_SIZE) {
      await assertWorkflowLease(heartbeat);
      let chunk = remaining.slice(start, start + COMMIT_CHUNK_SIZE);

      for (let attempt = 1; chunk.length > 0; attempt += 1) {
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

        try {
          await withTxn(this.db, async (tx) => {
            await this.transactions.insertImportedRows(userId, batch.accountId, batchId, rows, tx);
            if (netMinor !== 0) {
              assertBalanceDeltaApplied(
                await this.accounts.applyBalanceDelta(userId, batch.accountId, netMinor, tx)
              );
            }
            await this.audit.record(userId, "import.commit", batchId, tx, {
              chunkSize: chunk.length,
              netMinor
            });
            await this.batches.incrementCommittedCount(userId, batchId, chunk.length, tx);
          });
          break;
        } catch (error) {
          if (!isUniqueViolation(error) || attempt >= COMMIT_CONFLICT_MAX_ATTEMPTS) throw error;
          // A concurrent commit attempt won the race on one or more rows in
          // this chunk. Re-check what actually landed and retry only the
          // genuinely-new remainder — never re-post what's already there.
          const fingerprints = rows.map((row) => row.dedupeFingerprintV2);
          const landedNow = await this.transactions.findExistingDedupeFingerprintsV2(
            userId,
            fingerprints
          );
          chunk = chunk.filter(
            (row) =>
              row.dedupeFingerprintV2 !== undefined && !landedNow.has(row.dedupeFingerprintV2)
          );
        }
      }
    }

    if (claimToken === undefined) {
      await this.batches.markCommitted(userId, batchId);
    } else {
      await assertWorkflowLease(heartbeat);
      await this.batches.completeWorkflow(userId, batchId, "commit", claimToken, "committed");
    }
    this.recordCategorySuggestionFeedback(includable);
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
  async revertBatch(
    userId: string,
    batchId: ImportBatchId,
    claimToken?: string,
    heartbeat?: () => Promise<boolean>
  ): Promise<ImportBatch> {
    const batch = await this.batches.findById(userId, batchId);
    if (batch === null) throw new EntityNotFoundError("Import batch");
    if (batch.status !== "committed" && batch.status !== "reverting") {
      throw new ImportBatchNotReadyError(
        `Only a committed batch can be reverted (current status: "${batch.status}").`
      );
    }

    await assertWorkflowLease(heartbeat);
    const posted = await this.transactions.findPostedByImportBatchId(userId, batchId);

    for (let start = 0; start < posted.length; start += REVERT_CHUNK_SIZE) {
      await assertWorkflowLease(heartbeat);
      const chunk = posted.slice(start, start + REVERT_CHUNK_SIZE);
      const netMinor = chunk.reduce(
        (sum, original) =>
          sum + (original.type === "expense" ? original.amountMinor : -original.amountMinor),
        0
      );

      await withTxn(this.db, async (tx) => {
        await this.transactions.insertBulkReversals(userId, chunk, tx);
        if (netMinor !== 0) {
          assertBalanceDeltaApplied(
            await this.accounts.applyReversalBalanceDelta(userId, batch.accountId, netMinor, tx)
          );
        }
        await this.audit.record(userId, "import.revert", batchId, tx, {
          chunkSize: chunk.length,
          netMinor
        });
      });
    }

    if (claimToken === undefined) {
      await this.batches.markReverted(userId, batchId);
    } else {
      await assertWorkflowLease(heartbeat);
      await this.batches.completeWorkflow(userId, batchId, "revert", claimToken, "reverted");
    }
    const reverted = await this.batches.findById(userId, batchId);
    if (reverted === null) throw new EntityNotFoundError("Import batch");
    return reverted;
  }

  private async getConcurrentWorkflow(
    userId: string,
    batchId: ImportBatchId,
    operation: "commit" | "revert"
  ): Promise<ImportBatch> {
    const current = await this.batches.findById(userId, batchId);
    if (current === null) throw new EntityNotFoundError("Import batch");
    if (
      operation === "commit" &&
      (current.status === "commit_queued" ||
        current.status === "committing" ||
        current.status === "committed")
    ) {
      return current;
    }
    if (
      operation === "revert" &&
      (current.status === "revert_queued" ||
        current.status === "reverting" ||
        current.status === "reverted")
    ) {
      return current;
    }
    throw new ImportBatchNotReadyError(
      `The batch does not contain a recoverable ${operation} workflow.`
    );
  }

  private recordCategorySuggestionFeedback(rows: readonly StagedRow[]): void {
    for (const row of rows) {
      const suggestion = row.categorySuggestion;
      if (suggestion === undefined) continue;
      if (row.suggestedCategoryId === undefined) {
        this.metrics.recordCategorySuggestions("dismissed", 1);
      } else if (row.suggestedCategoryId === suggestion.categoryId) {
        this.metrics.recordCategorySuggestions("accepted_unchanged", 1);
      } else {
        this.metrics.recordCategorySuggestions("corrected", 1);
      }
    }
  }
}

function toCommitRow(
  row: StagedRow
): ParsedRow & { dedupeFingerprintV2: string; categoryId?: string } {
  if (row.parsed === undefined || row.dedupeFingerprintV2 === undefined) {
    throw new Error(
      `Staged row ${row.id} is marked includable but is missing its parsed data or ` +
        "dedupeFingerprintV2 — this should be impossible by construction (parseFile only ever " +
        "sets include: true alongside a successful parse)."
    );
  }
  return {
    ...row.parsed,
    dedupeFingerprintV2: row.dedupeFingerprintV2,
    ...(row.suggestedCategoryId === undefined ? {} : { categoryId: row.suggestedCategoryId })
  };
}

/**
 * The bounded window for the whole file's near-duplicate candidate query:
 * one calendar day of slack on either side of the earliest/latest row in
 * this batch, covering the IST/UTC midnight boundary without scanning
 * unbounded history.
 */
function candidateWindowBounds(
  occurredAtValues: readonly Date[]
): Readonly<{ start: Date; end: Date }> {
  let earliestMs = Number.POSITIVE_INFINITY;
  let latestMs = Number.NEGATIVE_INFINITY;
  for (const date of occurredAtValues) {
    const ms = date.getTime();
    if (ms < earliestMs) earliestMs = ms;
    if (ms > latestMs) latestMs = ms;
  }
  return {
    start: addDaysUtc(istCalendarDateStartUtc(new Date(earliestMs)), -NEAR_DUPLICATE_DAY_WINDOW),
    end: addDaysUtc(istCalendarDateStartUtc(new Date(latestMs)), NEAR_DUPLICATE_DAY_WINDOW + 1)
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
    throw new ImportFileTooLargeError();
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

function isDeletableStatus(status: ImportBatch["status"]): boolean {
  return DELETABLE_IMPORT_BATCH_STATUSES.some((deletable) => deletable === status);
}

function workflowLeaseUntil(): Date {
  return new Date(Date.now() + WORKFLOW_LEASE_MS);
}

function errorSummary(error: unknown): string {
  if (error instanceof Error) return error.message;
  return "Unknown import workflow failure";
}

async function assertWorkflowLease(heartbeat: (() => Promise<boolean>) | undefined): Promise<void> {
  if (heartbeat !== undefined && !(await heartbeat())) {
    throw new Error("Import workflow lease was superseded by a newer claim.");
  }
}
