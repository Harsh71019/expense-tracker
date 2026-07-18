import { ColumnMappingSchema, type ColumnMapping, type DateFormat } from "@vyaya/shared";
import type { HttpHandler } from "msw";

import { applyBalanceDelta, findAccount, findImportBatch } from "../data/store";
import type { ColumnMappingDto, StagedRowDto, TransactionDto } from "../data/store";
import { mockProblem } from "../data/problem";
import type { MockHttp, MockStore } from "./types";

function parseAmountToMinor(raw: string | undefined): number | undefined {
  if (raw === undefined) return undefined;
  const trimmed = raw.trim().replaceAll(",", "");
  if (trimmed === "") return undefined;
  const value = Number(trimmed);
  if (!Number.isFinite(value) || value === 0) return undefined;
  return Math.round(Math.abs(value) * 100);
}

/** Naive best-effort date parser; real CSVs are tidier than this handles, which is fine for mock data. */
function parseDateToIso(raw: string, format: DateFormat): string | undefined {
  const trimmed = raw.trim();
  if (format === "YYYY-MM-DD") {
    const date = new Date(`${trimmed}T00:00:00.000Z`);
    return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
  }

  const parts = trimmed.split(/[/-]/);
  const [first, second, year] = parts;
  if (first === undefined || second === undefined || year === undefined) return undefined;
  const [day, month] = format === "DD/MM/YYYY" ? [first, second] : [second, first];
  const fullYear = year.length === 2 ? `20${year}` : year;
  const date = new Date(
    `${fullYear}-${month.padStart(2, "0")}-${day.padStart(2, "0")}T00:00:00.000Z`
  );
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

/** Naive comma-split CSV parse (no quoted-field support) — good enough for the bank-statement presets. */
function parseCsv(text: string): { headers: string[]; rows: string[][] } {
  const lines = text.split(/\r\n|\n/).filter((line) => line.trim() !== "");
  const [headerLine, ...rest] = lines;
  const headers = (headerLine ?? "").split(",").map((cell) => cell.trim());
  const rows = rest.map((line) => line.split(",").map((cell) => cell.trim()));
  return { headers, rows };
}

/** zod's `.optional()` allows an explicit `undefined` value; the generated DTO shape requires the key to be absent instead. */
function toColumnMappingDto(mapping: ColumnMapping): ColumnMappingDto {
  return {
    date: mapping.date,
    description: mapping.description,
    dateFormat: mapping.dateFormat,
    amountConvention: mapping.amountConvention,
    ...(mapping.amount === undefined ? {} : { amount: mapping.amount }),
    ...(mapping.debit === undefined ? {} : { debit: mapping.debit }),
    ...(mapping.credit === undefined ? {} : { credit: mapping.credit })
  };
}

function parseRow(
  headers: string[],
  cells: string[],
  mapping: ColumnMappingDto
): { raw: Record<string, string>; parsed: StagedRowDto["parsed"] } {
  const raw: Record<string, string> = {};
  headers.forEach((header, index) => {
    raw[header] = cells[index] ?? "";
  });

  const occurredAt = parseDateToIso(raw[mapping.date] ?? "", mapping.dateFormat);
  const description = raw[mapping.description] ?? "";

  let amountMinor: number | undefined;
  let type: "expense" | "income" | undefined;
  if (mapping.amountConvention === "single_signed") {
    const value = raw[mapping.amount ?? ""] ?? "";
    amountMinor = parseAmountToMinor(value.replace("-", ""));
    type = value.trim().startsWith("-") ? "expense" : "income";
  } else {
    const debit = parseAmountToMinor(raw[mapping.debit ?? ""]);
    const credit = parseAmountToMinor(raw[mapping.credit ?? ""]);
    if (debit !== undefined) {
      amountMinor = debit;
      type = "expense";
    } else if (credit !== undefined) {
      amountMinor = credit;
      type = "income";
    }
  }

  if (occurredAt === undefined || amountMinor === undefined || type === undefined) {
    return { raw, parsed: undefined };
  }
  return { raw, parsed: { occurredAt, amountMinor, type, description } };
}

export function importHandlers(http: MockHttp, store: MockStore): HttpHandler[] {
  return [
    http.get("/v1/imports", ({ response }) => {
      return response(200).json(store.importBatches);
    }),

    http.post("/v1/imports", async ({ request, response }) => {
      const form = await request.formData();
      const file = form.get("file");
      const accountId = form.get("accountId");
      const mappingRaw = form.get("mapping");
      if (
        !(file instanceof File) ||
        typeof accountId !== "string" ||
        typeof mappingRaw !== "string"
      ) {
        return response(422).json(
          mockProblem(422, "common.validation_failed", "Missing file, accountId, or mapping.")
        );
      }

      const account = findAccount(store, accountId);
      if (account === undefined) {
        return response(422).json(
          mockProblem(422, "common.validation_failed", "Account does not exist.")
        );
      }

      let mappingJson: unknown;
      try {
        mappingJson = JSON.parse(mappingRaw);
      } catch {
        return response(422).json(
          mockProblem(422, "import.invalid_file", "Mapping is not valid JSON.")
        );
      }
      const mappingResult = ColumnMappingSchema.safeParse(mappingJson);
      if (!mappingResult.success) {
        return response(422).json(mockProblem(422, "import.invalid_file", "Mapping is not valid."));
      }
      const mapping = toColumnMappingDto(mappingResult.data);

      const text = await file.text();
      const { headers, rows } = parseCsv(text);
      const now = new Date().toISOString();
      const batch = {
        id: store.nextImportBatchId(),
        userId: store.profile.userId,
        accountId,
        filename: file.name,
        fileHash: `mock-${store.importBatches.length + 1}`,
        mapping,
        status: "staged" as const,
        stats: { total: rows.length, staged: rows.length, duplicates: 0, committed: 0 },
        createdAt: now,
        updatedAt: now
      };
      store.importBatches.push(batch);
      store.savedMappings.set(accountId, mapping);

      rows.forEach((cells, index) => {
        const { raw, parsed } = parseRow(headers, cells, mapping);
        const rule =
          parsed === undefined
            ? undefined
            : store.categoryRules.find((candidate) =>
                parsed.description.toUpperCase().includes(candidate.pattern.toUpperCase())
              );
        store.stagedRows.push({
          id: store.nextStagedRowId(),
          batchId: batch.id,
          rowNumber: index + 1,
          raw,
          ...(parsed === undefined ? {} : { parsed }),
          ...(rule === undefined ? {} : { suggestedCategoryId: rule.categoryId }),
          problems: parsed === undefined ? ["Could not parse this row."] : [],
          isDuplicate: false,
          include: parsed !== undefined
        });
      });

      return response(201).json(batch);
    }),

    http.get("/v1/imports/accounts/{accountId}/mapping", ({ params, response }) => {
      return response(200).json({ mapping: store.savedMappings.get(params.accountId) ?? null });
    }),

    http.get("/v1/imports/{importBatchId}/preview", ({ params, query, response }) => {
      const batch = findImportBatch(store, params.importBatchId);
      if (batch === undefined) {
        return response(404).json(mockProblem(404, "common.not_found", "Import batch not found."));
      }

      const limitRaw = query.get("limit");
      const limit = limitRaw === null ? 50 : Number(limitRaw);
      const cursor = query.get("cursor");
      const rows = store.stagedRows.filter((row) => row.batchId === batch.id);
      const startIndex =
        cursor === null ? 0 : Math.max(rows.findIndex((row) => row.id === cursor) + 1, 0);
      const page = rows.slice(startIndex, startIndex + limit);
      const hasMore = startIndex + limit < rows.length;
      const lastItem = page.at(-1);

      return response(200).json({
        items: page,
        pageInfo: {
          nextCursor: hasMore && lastItem !== undefined ? lastItem.id : null,
          hasMore,
          limit
        }
      });
    }),

    http.patch(
      "/v1/imports/{importBatchId}/rows/{stagedRowId}",
      async ({ params, request, response }) => {
        const row = store.stagedRows.find(
          (candidate) =>
            candidate.batchId === params.importBatchId && candidate.id === params.stagedRowId
        );
        if (row === undefined) {
          return response(404).json(mockProblem(404, "common.not_found", "Staged row not found."));
        }

        const body = await request.json();
        if (body === undefined) {
          return response(422).json(
            mockProblem(422, "common.validation_failed", "Request body is required.")
          );
        }
        if (body.include !== undefined) row.include = body.include;
        if (body.suggestedCategoryId !== undefined) {
          if (body.suggestedCategoryId === null) {
            delete row.suggestedCategoryId;
          } else {
            row.suggestedCategoryId = body.suggestedCategoryId;
          }
        }
        return response(200).json(row);
      }
    ),

    http.post("/v1/imports/{importBatchId}/commit", ({ params, response }) => {
      const batch = findImportBatch(store, params.importBatchId);
      if (batch === undefined) {
        return response(404).json(mockProblem(404, "common.not_found", "Import batch not found."));
      }
      if (batch.status !== "staged") {
        return response(409).json(
          mockProblem(409, "import.invalid_state", "Import batch cannot be committed.")
        );
      }

      const account = findAccount(store, batch.accountId);
      const createdIds: string[] = [];
      const rows = store.stagedRows.filter((row) => row.batchId === batch.id);
      for (const row of rows) {
        if (!row.include || row.parsed === undefined || account === undefined) continue;
        const now = new Date().toISOString();
        const transaction: TransactionDto = {
          id: store.nextTransactionId(),
          userId: store.profile.userId,
          accountId: account.id,
          ...(row.suggestedCategoryId === undefined ? {} : { categoryId: row.suggestedCategoryId }),
          type: row.parsed.type,
          amountMinor: row.parsed.amountMinor,
          currency: "INR",
          occurredAt: row.parsed.occurredAt,
          description: row.parsed.description,
          tags: [],
          source: "csv_import",
          status: "posted",
          createdAt: now,
          updatedAt: now
        };
        store.transactions.push(transaction);
        createdIds.push(transaction.id);
        applyBalanceDelta(
          store,
          account.id,
          transaction.type === "income" ? transaction.amountMinor : -transaction.amountMinor
        );
      }

      store.committedBatchTransactionIds.set(batch.id, createdIds);
      batch.status = "committed";
      batch.stats = { ...batch.stats, committed: createdIds.length };
      batch.committedAt = new Date().toISOString();
      batch.updatedAt = batch.committedAt;
      return response(200).json(batch);
    }),

    http.post("/v1/imports/{importBatchId}/revert", ({ params, response }) => {
      const batch = findImportBatch(store, params.importBatchId);
      if (batch === undefined) {
        return response(404).json(mockProblem(404, "common.not_found", "Import batch not found."));
      }
      if (batch.status !== "committed") {
        return response(409).json(
          mockProblem(409, "import.invalid_state", "Import batch cannot be reverted.")
        );
      }

      const transactionIds = store.committedBatchTransactionIds.get(batch.id) ?? [];
      for (const transactionId of transactionIds) {
        const transaction = store.transactions.find((txn) => txn.id === transactionId);
        if (transaction === undefined || transaction.status !== "posted") continue;
        const now = new Date().toISOString();
        const reversal: TransactionDto = {
          ...transaction,
          id: store.nextTransactionId(),
          type: transaction.type === "expense" ? "income" : "expense",
          status: "reversal",
          reversalOf: transaction.id,
          description: `Reversal: ${transaction.description}`,
          occurredAt: now,
          createdAt: now,
          updatedAt: now
        };
        store.transactions.push(reversal);
        transaction.status = "reversed";
        transaction.reversedBy = reversal.id;
        transaction.updatedAt = now;
        applyBalanceDelta(
          store,
          transaction.accountId,
          transaction.type === "expense" ? transaction.amountMinor : -transaction.amountMinor
        );
      }

      batch.status = "reverted";
      batch.revertedAt = new Date().toISOString();
      batch.updatedAt = batch.revertedAt;
      return response(200).json(batch);
    })
  ];
}
