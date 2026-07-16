import { Injectable } from "@nestjs/common";
import type { ColumnMapping, ImportBatchId, ImportBatchStats } from "@vyaya/shared";
import { parse } from "csv-parse/sync";
import { z } from "zod";

import { TransactionRepository } from "../transactions/transaction.repository.js";
import { computeDedupeHash } from "./dedupe-hash.js";
import { ImportBatchRepository } from "./import-batch.repository.js";
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
    private readonly transactions: TransactionRepository
  ) {}

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
}
