import { createHash } from "node:crypto";
import { extname } from "node:path";

import { Inject, Injectable } from "@nestjs/common";
import {
  ALLOWED_IMPORT_FILE_EXTENSIONS,
  ALLOWED_IMPORT_MIME_TYPES,
  BillStatementRowSchema,
  BillStatementUploadSchema,
  CreditCardBillSchema,
  MAX_IMPORT_FILE_SIZE_BYTES,
  MAX_IMPORT_ROWS,
  addUtcCalendarDays,
  calendarDayDistance,
  type BillStatementRow,
  type BillStatementRowId,
  type BillStatementRowPage,
  type BillStatementStats,
  type BillStatementUpload,
  type BillStatementUploadId,
  type ColumnMapping,
  type CreditCardBill,
  type CreditCardBillId,
  type ListBillStatementRowsQuery,
  type ParsedRow,
  type Transaction,
  type TransactionId,
  type UpdateBillStatementRow
} from "@treasury-ops/shared";
import { parse } from "csv-parse/sync";
import { z } from "zod";

import { AuditRepository } from "../audit/audit.repository.js";
import { parseCsvRow } from "../common/csv/parse-csv-row.js";
import { DATABASE_CONNECTION } from "../common/db/db.module.js";
import type { DrizzleDb } from "../common/db/db.module.js";
import { withTxn } from "../common/db/db-txn.js";
import { BillAlreadyReconciledError } from "../common/errors/bill-already-reconciled.error.js";
import { BillStatementNotReadyError } from "../common/errors/bill-statement-not-ready.error.js";
import { BillStatementUnresolvedError } from "../common/errors/bill-statement-unresolved.error.js";
import { EntityNotFoundError } from "../common/errors/entity-not-found.error.js";
import { InvalidBillStatementFileError } from "../common/errors/invalid-bill-statement-file.error.js";
import {
  IdempotencyPostgresService,
  type IdempotentResult
} from "../common/idempotency/idempotency-postgres.service.js";
import { MetricsService } from "../common/observability/metrics.service.js";
import { TransactionRepository } from "../transactions/transaction.repository.js";
import { BillStatementRepository } from "./bill-statement.repository.js";
import type { NewBillStatementRow } from "./bill-statement.repository.js";
import { BillStatementsQueue } from "./bill-statements.queue.js";
import { CreditCardBillRepository } from "./credit-card-bill.repository.js";
import {
  STATEMENT_ASSIGNMENT_DATE_WINDOW_DAYS,
  STATEMENT_ASSIGNMENT_MAX_ROWS,
  matchStatementRows,
  type StatementRowCandidate
} from "./statement-matcher.js";

const RawCsvRecordsSchema = z.array(z.record(z.string(), z.string()));
const ROW_INSERT_CHUNK_SIZE = 200;
const STATEMENT_ASSIGNMENT_MAX_CANDIDATES = 150;

type ParsedStatementRowCandidate = StatementRowCandidate & Readonly<{ parsed: ParsedRow }>;

@Injectable()
export class BillReconciliationService {
  constructor(
    @Inject(DATABASE_CONNECTION) private readonly db: DrizzleDb,
    private readonly bills: CreditCardBillRepository,
    private readonly statements: BillStatementRepository,
    private readonly transactions: TransactionRepository,
    private readonly audit: AuditRepository,
    private readonly idempotency: IdempotencyPostgresService,
    private readonly queue: BillStatementsQueue,
    private readonly metrics?: MetricsService
  ) {}

  async upload(
    userId: string,
    billId: CreditCardBillId,
    filename: string,
    mimetype: string,
    buffer: Buffer,
    mapping: ColumnMapping,
    key: string
  ): Promise<IdempotentResult<BillStatementUpload>> {
    assertValidStatementFile(filename, mimetype, buffer);
    const fileHash = createHash("sha256").update(buffer).digest("hex");
    const result = await this.idempotency.execute(
      userId,
      "credit-card.statement.upload",
      key,
      { billId, filename, fileHash, mapping },
      BillStatementUploadSchema,
      async (tx) => {
        const bill = await this.bills.findByIdForUpdate(userId, billId, tx);
        if (bill === null) throw new EntityNotFoundError("Bill");
        assertStatementEditable(bill);
        const upload = await this.statements.createActive(
          userId,
          billId,
          filename,
          fileHash,
          mapping,
          tx
        );
        await this.audit.record(userId, "credit-card.statement.upload", upload.id, tx, {
          billId
        });
        return upload;
      }
    );
    await this.queue.enqueueParse({
      uploadId: result.result.id,
      billId,
      userId,
      mapping,
      fileContentBase64: buffer.toString("base64")
    });
    return result;
  }

  async parseStatement(
    uploadId: BillStatementUploadId,
    billId: CreditCardBillId,
    userId: string,
    mapping: ColumnMapping,
    fileContent: string
  ): Promise<void> {
    const bill = await this.bills.findById(userId, billId);
    const upload = await this.statements.findById(userId, uploadId);
    if (bill === null || upload === null || upload.billId !== billId || !upload.active) {
      throw new EntityNotFoundError("Active bill statement");
    }

    let records: Record<string, string>[];
    try {
      const raw: unknown = parse(fileContent, {
        columns: true,
        skip_empty_lines: true,
        trim: true
      });
      records = RawCsvRecordsSchema.parse(raw);
      if (records.length > MAX_IMPORT_ROWS) {
        throw new RangeError(`Statement exceeds the ${MAX_IMPORT_ROWS} row limit.`);
      }
    } catch {
      await this.statements.markProcessed(userId, uploadId, "failed", emptyStats());
      return;
    }

    const parsedRows = records.map((raw, index) => {
      const rowNumber = index + 1;
      const { parsed, problems } = parseCsvRow(raw, mapping);
      return { rowNumber, raw, ...(parsed === undefined ? {} : { parsed }), problems };
    });
    const assignmentRows: StatementRowCandidate[] = parsedRows.map((row) => ({
      rowNumber: row.rowNumber,
      ...(row.parsed === undefined ? {} : { parsed: row.parsed })
    }));
    const candidateResult = await this.findAssignmentCandidates(
      userId,
      bill.accountId,
      bill.cycleStart,
      dayAfter(bill.cycleEnd),
      assignmentRows
    );
    const inputWatermark = reconciliationInputWatermark(assignmentRows, candidateResult.items);
    const matches = matchStatementRows(
      assignmentRows,
      candidateResult.items,
      inputWatermark,
      candidateResult.limitHit
    );
    this.recordAssignmentMetrics(matches, candidateResult.limitHit);
    const matchByRow = new Map(matches.map((match) => [match.rowNumber, match]));
    const staged: NewBillStatementRow[] = parsedRows.map((row) => {
      const match = matchByRow.get(row.rowNumber);
      if (match === undefined) throw new Error("Statement matcher omitted a row.");
      return {
        rowNumber: row.rowNumber,
        raw: row.raw,
        ...(row.parsed === undefined ? {} : { parsed: row.parsed }),
        ...(match.matchedTransactionId === undefined
          ? {}
          : { matchedTransactionId: match.matchedTransactionId }),
        ...(match.matchSuggestion === undefined ? {} : { matchSuggestion: match.matchSuggestion }),
        matchStatus: match.matchStatus,
        problems: row.problems
      };
    });

    await this.statements.deleteRows(userId, uploadId);
    for (let start = 0; start < staged.length; start += ROW_INSERT_CHUNK_SIZE) {
      const chunk = staged.slice(start, start + ROW_INSERT_CHUNK_SIZE);
      await withTxn(this.db, (tx) => this.statements.insertRows(userId, uploadId, chunk, tx));
    }
    await this.statements.markProcessed(userId, uploadId, "staged", statsFor(staged));
  }

  async listRows(
    userId: string,
    billId: CreditCardBillId,
    query: ListBillStatementRowsQuery
  ): Promise<BillStatementRowPage> {
    const bill = await this.bills.findById(userId, billId);
    if (bill === null) throw new EntityNotFoundError("Bill");
    const upload = await this.statements.findActiveByBillId(userId, billId);
    if (upload === null) throw new EntityNotFoundError("Active bill statement");
    return this.statements.findRows(userId, upload.id, query);
  }

  updateRow(
    userId: string,
    billId: CreditCardBillId,
    rowId: BillStatementRowId,
    patch: UpdateBillStatementRow,
    key: string
  ): Promise<IdempotentResult<BillStatementRow>> {
    return this.idempotency.execute(
      userId,
      "credit-card.statement.row.update",
      key,
      { billId, rowId, patch },
      BillStatementRowSchema,
      async (tx) => {
        const bill = await this.bills.findByIdForUpdate(userId, billId, tx);
        if (bill === null) throw new EntityNotFoundError("Bill");
        assertStatementEditable(bill);
        const upload = await this.statements.findActiveByBillId(userId, billId, tx);
        if (upload === null || upload.status !== "staged") {
          throw new BillStatementNotReadyError("The active statement is not ready for review.");
        }
        const row = await this.statements.findRow(userId, upload.id, rowId, tx);
        if (row === null) throw new EntityNotFoundError("Statement row");

        if (patch.matchedTransactionId !== undefined && patch.matchedTransactionId !== null) {
          await this.assertValidManualMatch(userId, bill, row, patch.matchedTransactionId, tx);
        }
        if (patch.acknowledged === true && row.matchStatus === "matched") {
          throw new BillStatementNotReadyError("A matched row does not need acknowledgement.");
        }

        const updated = await this.statements.updateRow(userId, upload.id, rowId, patch, tx);
        if (updated === null) throw new EntityNotFoundError("Statement row");
        await this.statements.recomputeStats(userId, upload.id, tx);
        await this.audit.record(userId, "credit-card.statement.row.update", rowId, tx, {
          billId
        });
        return updated;
      }
    );
  }

  acknowledgeExtra(
    userId: string,
    billId: CreditCardBillId,
    transactionId: TransactionId,
    acknowledged: boolean,
    key: string
  ): Promise<IdempotentResult<BillStatementUpload>> {
    return this.idempotency.execute(
      userId,
      "credit-card.statement.extra.acknowledge",
      key,
      { billId, transactionId, acknowledged },
      BillStatementUploadSchema,
      async (tx) => {
        const bill = await this.bills.findByIdForUpdate(userId, billId, tx);
        if (bill === null) throw new EntityNotFoundError("Bill");
        assertStatementEditable(bill);
        const upload = await this.statements.findActiveByBillId(userId, billId, tx);
        if (upload === null || upload.status !== "staged") {
          throw new BillStatementNotReadyError("The active statement is not ready for review.");
        }
        const transaction = await this.transactions.findById(userId, transactionId, tx);
        if (
          transaction === null ||
          transaction.accountId !== bill.accountId ||
          transaction.occurredAt < bill.cycleStart ||
          transaction.occurredAt >= dayAfter(bill.cycleEnd)
        ) {
          throw new EntityNotFoundError("Cycle transaction");
        }
        const matched = await this.statements.findMatchedTransactionIds(userId, upload.id, tx);
        if (matched.has(transactionId)) {
          throw new BillStatementNotReadyError("A matched transaction is not an extra ledger row.");
        }
        await this.statements.setExtraAcknowledgement(
          userId,
          upload.id,
          transactionId,
          acknowledged,
          tx
        );
        await this.audit.record(
          userId,
          "credit-card.statement.extra.acknowledge",
          transactionId,
          tx,
          {
            billId,
            acknowledged
          }
        );
        const updated = await this.statements.findById(userId, upload.id, tx);
        if (updated === null) throw new EntityNotFoundError("Active bill statement");
        return updated;
      }
    );
  }

  reconcile(
    userId: string,
    billId: CreditCardBillId,
    key: string
  ): Promise<IdempotentResult<CreditCardBill>> {
    return this.idempotency.execute(
      userId,
      "credit-card.statement.reconcile",
      key,
      { billId },
      CreditCardBillSchema,
      async (tx) => {
        const bill = await this.bills.findByIdForUpdate(userId, billId, tx);
        if (bill === null) throw new EntityNotFoundError("Bill");
        assertStatementEditable(bill);
        const upload = await this.statements.findActiveByBillId(userId, billId, tx);
        if (upload === null || upload.status !== "staged") {
          throw new BillStatementNotReadyError("The active statement is not staged.");
        }
        const stats = await this.statements.recomputeStats(userId, upload.id, tx);
        if (stats.total - stats.matched - stats.acknowledged > 0) {
          throw new BillStatementUnresolvedError();
        }
        const reconciled = await this.bills.markReconciled(userId, billId, tx);
        if (reconciled === null) throw new BillAlreadyReconciledError();
        await this.audit.record(userId, "credit-card.statement.reconcile", billId, tx, {
          uploadId: upload.id
        });
        return reconciled;
      }
    );
  }

  private async assertValidManualMatch(
    userId: string,
    bill: CreditCardBill,
    row: BillStatementRow,
    transactionId: TransactionId,
    tx: Parameters<TransactionRepository["findById"]>[2]
  ): Promise<void> {
    const parsed = row.parsed;
    const transaction = await this.transactions.findById(userId, transactionId, tx);
    if (
      parsed === undefined ||
      transaction === null ||
      transaction.accountId !== bill.accountId ||
      transaction.type !== parsed.type ||
      transaction.amountMinor !== parsed.amountMinor ||
      calendarDayDistance(transaction.occurredAt, parsed.occurredAt) > 1 ||
      transaction.occurredAt < bill.cycleStart ||
      transaction.occurredAt >= dayAfter(bill.cycleEnd)
    ) {
      throw new EntityNotFoundError("Matching cycle transaction");
    }
  }

  private async findAssignmentCandidates(
    userId: string,
    accountId: string,
    cycleStart: Date,
    cycleEndExclusive: Date,
    rows: readonly StatementRowCandidate[]
  ): Promise<Readonly<{ items: readonly Transaction[]; limitHit: boolean }>> {
    const parsedRows = rows.filter(
      (row): row is ParsedStatementRowCandidate => row.parsed !== undefined
    );
    if (parsedRows.length === 0) return { items: [], limitHit: false };
    if (parsedRows.length > STATEMENT_ASSIGNMENT_MAX_ROWS) return { items: [], limitHit: true };

    const dates = parsedRows.map((row) => row.parsed.occurredAt.getTime());
    const earliest = Math.min(...dates);
    const latest = Math.max(...dates);
    if (!Number.isFinite(earliest) || !Number.isFinite(latest)) {
      return { items: [], limitHit: true };
    }
    const from = addUtcCalendarDays(new Date(earliest), -STATEMENT_ASSIGNMENT_DATE_WINDOW_DAYS - 1);
    const toExclusive = addUtcCalendarDays(
      new Date(latest),
      STATEMENT_ASSIGNMENT_DATE_WINDOW_DAYS + 2
    );
    const boundedFrom = new Date(Math.max(from.getTime(), cycleStart.getTime()));
    const boundedToExclusive = new Date(
      Math.min(toExclusive.getTime(), cycleEndExclusive.getTime())
    );
    if (boundedFrom >= boundedToExclusive) return { items: [], limitHit: false };
    return this.transactions.findBoundedReconciliationCandidates(userId, {
      accountId,
      from: boundedFrom,
      toExclusive: boundedToExclusive,
      types: [...new Set(parsedRows.map((row) => row.parsed.type))],
      amountMinors: [...new Set(parsedRows.map((row) => row.parsed.amountMinor))],
      limit: STATEMENT_ASSIGNMENT_MAX_CANDIDATES
    });
  }

  private recordAssignmentMetrics(
    matches: readonly ReturnType<typeof matchStatementRows>[number][],
    resourceLimitHit: boolean
  ): void {
    this.metrics?.recordStatementAssignments(
      "matched",
      matches.filter((match) => match.matchStatus === "matched").length
    );
    this.metrics?.recordStatementAssignments(
      "ambiguous",
      matches.filter((match) => match.matchStatus === "ambiguous").length
    );
    this.metrics?.recordStatementAssignments(
      "missing_from_ledger",
      matches.filter((match) => match.matchStatus === "missing_from_ledger").length
    );
    if (resourceLimitHit) this.metrics?.recordStatementAssignments("resource_limit", 1);
  }
}

function assertStatementEditable(bill: CreditCardBill): void {
  if (bill.reconciliationStatus === "reconciled") throw new BillAlreadyReconciledError();
}

function assertValidStatementFile(filename: string, mimetype: string, buffer: Buffer): void {
  const extension = extname(filename).toLowerCase();
  const extensionAllowed = ALLOWED_IMPORT_FILE_EXTENSIONS.some((allowed) => allowed === extension);
  const mimeAllowed = ALLOWED_IMPORT_MIME_TYPES.some((allowed) => allowed === mimetype);
  if (!extensionAllowed || !mimeAllowed || buffer.length === 0) {
    throw new InvalidBillStatementFileError("Upload a non-empty CSV statement.");
  }
  if (buffer.length > MAX_IMPORT_FILE_SIZE_BYTES) {
    throw new InvalidBillStatementFileError(
      `Statement exceeds the ${MAX_IMPORT_FILE_SIZE_BYTES} byte limit.`
    );
  }
}

function statsFor(rows: readonly NewBillStatementRow[]): BillStatementStats {
  return {
    total: rows.length,
    matched: rows.filter((row) => row.matchStatus === "matched").length,
    missing: rows.filter((row) => row.matchStatus === "missing_from_ledger").length,
    ambiguous: rows.filter((row) => row.matchStatus === "ambiguous").length,
    acknowledged: 0
  };
}

function emptyStats(): BillStatementStats {
  return { total: 0, matched: 0, missing: 0, ambiguous: 0, acknowledged: 0 };
}

function dayAfter(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + 1));
}

function reconciliationInputWatermark(
  rows: readonly StatementRowCandidate[],
  transactions: readonly Transaction[]
): string {
  const input = {
    rows: rows.map((row) => ({
      rowNumber: row.rowNumber,
      parsed:
        row.parsed === undefined
          ? null
          : {
              occurredAt: row.parsed.occurredAt.toISOString(),
              amountMinor: row.parsed.amountMinor,
              type: row.parsed.type,
              description: row.parsed.description
            }
    })),
    transactions: transactions.map((transaction) => ({
      id: transaction.id,
      occurredAt: transaction.occurredAt.toISOString(),
      amountMinor: transaction.amountMinor,
      type: transaction.type,
      description: transaction.description,
      updatedAt: transaction.updatedAt.toISOString()
    }))
  };
  return createHash("sha256").update(JSON.stringify(input)).digest("hex");
}
