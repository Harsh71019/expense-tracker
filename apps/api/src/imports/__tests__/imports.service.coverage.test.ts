import {
  MAX_IMPORT_FILE_SIZE_BYTES,
  MAX_IMPORT_ROWS,
  type ColumnMapping,
  type ImportBatch,
  type StagedRow
} from "@treasury-ops/shared";
import { describe, expect, it, vi } from "vitest";

import { CategoryKindMismatchError } from "../../common/errors/category-kind-mismatch.error.js";
import { EntityNotFoundError } from "../../common/errors/entity-not-found.error.js";
import { ImportAlreadyCommittedError } from "../../common/errors/import-already-committed.error.js";
import { ImportBatchNotReadyError } from "../../common/errors/import-batch-not-ready.error.js";
import { InvalidImportFileError } from "../../common/errors/invalid-import-file.error.js";
import { focusedTestDouble } from "../../test/mock-drizzle.js";
import { assertValidImportFile, ImportsService } from "../imports.service.js";

const BATCH_ID = "123e4567-e89b-42d3-a456-426614174000";
const ACCOUNT_ID = "223e4567-e89b-42d3-a456-426614174000";
const ROW_ID = "323e4567-e89b-42d3-a456-426614174000";
const CATEGORY_ID = "423e4567-e89b-42d3-a456-426614174000";
const NOW = new Date("2026-07-01T00:00:00.000Z");
const MAPPING: ColumnMapping = {
  date: "Date",
  amount: "Amount",
  description: "Description",
  dateFormat: "YYYY-MM-DD",
  amountConvention: "single_signed"
};
const BATCH: ImportBatch = {
  id: BATCH_ID,
  userId: "u1",
  accountId: ACCOUNT_ID,
  filename: "rows.csv",
  fileHash: "hash",
  mapping: MAPPING,
  status: "staged",
  stats: { total: 1, staged: 1, duplicates: 0, committed: 0 },
  createdAt: NOW,
  updatedAt: NOW
};
const ROW: StagedRow = {
  id: ROW_ID,
  batchId: BATCH_ID,
  rowNumber: 1,
  raw: { Date: "2026-07-01", Amount: "-50.00", Description: "Coffee" },
  parsed: {
    occurredAt: NOW,
    amountMinor: 5_000,
    type: "expense",
    description: "Coffee"
  },
  dedupeFingerprintV2: "dedupe-1",
  suggestedCategoryId: CATEGORY_ID,
  problems: [],
  isDuplicate: false,
  include: true
};

type ServiceOverrides = Readonly<{
  db?: unknown;
  batches?: unknown;
  stagedRows?: unknown;
  transactions?: unknown;
  accounts?: unknown;
  categories?: unknown;
  audit?: unknown;
  categorySuggestions?: unknown;
  metrics?: unknown;
}>;

function createService(overrides: ServiceOverrides = {}) {
  const tx = {};
  const collaborators = {
    db:
      overrides.db ??
      ({
        transaction: vi.fn(async (work: (value: object) => Promise<unknown>) => work(tx))
      } satisfies Record<string, unknown>),
    batches: overrides.batches ?? {},
    stagedRows: overrides.stagedRows ?? {},
    transactions: overrides.transactions ?? {},
    accounts: overrides.accounts ?? {},
    categories: overrides.categories ?? {},
    audit: overrides.audit ?? { record: vi.fn().mockResolvedValue(undefined) },
    categorySuggestions: overrides.categorySuggestions ?? {
      suggestMany: vi
        .fn()
        .mockImplementation(async (_userId: string, targets: readonly unknown[]) =>
          targets.map(() => undefined)
        )
    },
    metrics: overrides.metrics ?? { recordCategorySuggestions: vi.fn() }
  };
  const service = new ImportsService(
    focusedTestDouble(collaborators.db),
    focusedTestDouble(collaborators.batches),
    focusedTestDouble(collaborators.stagedRows),
    focusedTestDouble(collaborators.transactions),
    focusedTestDouble(collaborators.accounts),
    focusedTestDouble(collaborators.categories),
    focusedTestDouble(collaborators.audit),
    focusedTestDouble(collaborators.categorySuggestions),
    focusedTestDouble(collaborators.metrics)
  );
  return { service, tx, ...collaborators };
}

describe("assertValidImportFile", () => {
  it("accepts supported CSV MIME aliases and case-insensitive extensions", () => {
    for (const mimetype of [
      "text/csv",
      "application/vnd.ms-excel",
      "application/csv",
      "text/plain"
    ]) {
      expect(() =>
        assertValidImportFile("ROWS.CSV", mimetype, Buffer.from("Date,Amount\n2026-01-01,1"))
      ).not.toThrow();
    }
  });

  it("rejects unsupported extensions, MIME types, empty files, and oversized files", () => {
    expect(() => assertValidImportFile("rows.txt", "text/csv", Buffer.from("x"))).toThrow(
      InvalidImportFileError
    );
    expect(() => assertValidImportFile("rows.csv", "application/json", Buffer.from("x"))).toThrow(
      InvalidImportFileError
    );
    expect(() => assertValidImportFile("rows.csv", "text/csv", Buffer.alloc(0))).toThrow(
      InvalidImportFileError
    );
    expect(() =>
      assertValidImportFile(
        "rows.csv",
        "text/csv",
        Buffer.alloc(MAX_IMPORT_FILE_SIZE_BYTES + 1, "x")
      )
    ).toThrow(InvalidImportFileError);
  });

  it("rejects files over the approximate row cap and accepts header-only content", () => {
    expect(() =>
      assertValidImportFile("rows.csv", "text/csv", Buffer.from("Date\n"))
    ).not.toThrow();
    const tooManyRows = [
      "Date",
      ...Array.from({ length: MAX_IMPORT_ROWS + 1 }, () => "2026-01-01")
    ].join("\n");
    expect(() => assertValidImportFile("rows.csv", "text/csv", Buffer.from(tooManyRows))).toThrow(
      InvalidImportFileError
    );
  });
});

describe("ImportsService create and parse", () => {
  it("creates a durable parse workflow in the database transaction", async () => {
    const batches = {
      findByFileHash: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue(BATCH)
    };
    const { service, tx } = createService({ batches });
    const buffer = Buffer.from("Date,Amount,Description\n2026-07-01,-50,Coffee");

    await expect(
      service.createBatch("u1", ACCOUNT_ID, "rows.csv", "text/csv", buffer, MAPPING)
    ).resolves.toBe(BATCH);
    expect(batches.create).toHaveBeenCalledWith(
      "u1",
      ACCOUNT_ID,
      "rows.csv",
      expect.any(String),
      MAPPING,
      expect.objectContaining({
        correlationId: expect.any(String),
        fileContentBase64: buffer.toString("base64"),
        tx
      })
    );
  });

  it("permits a repeated uncommitted file and rejects a committed one", async () => {
    const reusableBatches = {
      findByFileHash: vi.fn().mockResolvedValue({ ...BATCH, status: "reverted" }),
      create: vi.fn().mockResolvedValue(BATCH)
    };
    const committedBatches = {
      findByFileHash: vi.fn().mockResolvedValue({ ...BATCH, status: "committed" })
    };
    const buffer = Buffer.from("Date,Amount,Description\n2026-07-01,-50,Coffee");

    await expect(
      createService({ batches: reusableBatches }).service.createBatch(
        "u1",
        ACCOUNT_ID,
        "rows.csv",
        "text/csv",
        buffer,
        MAPPING
      )
    ).resolves.toBe(BATCH);
    await expect(
      createService({ batches: committedBatches }).service.createBatch(
        "u1",
        ACCOUNT_ID,
        "rows.csv",
        "text/csv",
        buffer,
        MAPPING
      )
    ).rejects.toBeInstanceOf(ImportAlreadyCommittedError);
  });

  it("marks structurally invalid CSV as failed", async () => {
    const batches = { markParsed: vi.fn().mockResolvedValue(undefined) };
    const stagedRows = { deleteAllForBatch: vi.fn().mockResolvedValue(undefined) };
    const { service } = createService({ batches, stagedRows });

    await service.parseFile(BATCH_ID, "u1", ACCOUNT_ID, MAPPING, '"unterminated');
    expect(batches.markParsed).toHaveBeenCalledWith("u1", BATCH_ID, "failed", {
      total: 0,
      staged: 0,
      duplicates: 0,
      committed: 0
    });
  });

  it("stages valid, invalid, existing-duplicate, and in-file duplicate rows", async () => {
    const batches = { markParsed: vi.fn().mockResolvedValue(undefined) };
    const stagedRows = {
      deleteAllForBatch: vi.fn().mockResolvedValue(undefined),
      insertMany: vi.fn().mockResolvedValue(undefined)
    };
    const transactions = {
      findExistingDedupeFingerprintsV2: vi
        .fn()
        .mockImplementation(
          async (_userId: string, fingerprints: readonly string[]) => new Set([fingerprints[0]])
        ),
      findExistingDedupeHashes: vi.fn().mockResolvedValue(new Map())
    };
    const categorySuggestions = {
      suggestMany: vi
        .fn()
        .mockImplementation(async (_userId: string, targets: readonly unknown[]) =>
          targets.map(() => ({
            categoryId: CATEGORY_ID,
            confidenceBps: 10_000,
            method: "explicit_rule",
            evidenceCount: 1,
            algorithmVersion: 1
          }))
        )
    };
    const categories = {
      list: vi.fn().mockResolvedValue([{ id: CATEGORY_ID, kind: "expense", isArchived: false }])
    };
    const metrics = { recordCategorySuggestions: vi.fn() };
    const { service } = createService({
      batches,
      stagedRows,
      transactions,
      categorySuggestions,
      categories,
      metrics
    });
    const csv = [
      "Date,Amount,Description",
      "2026-07-01,-50.00,Coffee",
      "2026-07-01,-50.00,Coffee",
      ",not-money,"
    ].join("\n");

    await service.parseFile(BATCH_ID, "u1", ACCOUNT_ID, MAPPING, csv);

    expect(stagedRows.insertMany).toHaveBeenCalledOnce();
    const inserted = stagedRows.insertMany.mock.calls[0]?.[2];
    expect(inserted).toEqual([
      expect.objectContaining({
        isDuplicate: true,
        include: false,
        suggestedCategoryId: CATEGORY_ID
      }),
      expect.objectContaining({
        isDuplicate: true,
        include: false,
        suggestedCategoryId: CATEGORY_ID
      }),
      expect.objectContaining({ isDuplicate: false, include: false })
    ]);
    expect(batches.markParsed).toHaveBeenCalledWith(
      "u1",
      BATCH_ID,
      "staged",
      expect.objectContaining({ total: 3, staged: 3, duplicates: 2, committed: 0 })
    );
    expect(metrics.recordCategorySuggestions).toHaveBeenCalledWith("suggested", 2);
  });

  it("chunks more than 200 staged rows and omits an absent category suggestion", async () => {
    const batches = { markParsed: vi.fn().mockResolvedValue(undefined) };
    const stagedRows = {
      deleteAllForBatch: vi.fn().mockResolvedValue(undefined),
      insertMany: vi.fn().mockResolvedValue(undefined)
    };
    const transactions = {
      findExistingDedupeFingerprintsV2: vi.fn().mockResolvedValue(new Set()),
      findExistingDedupeHashes: vi.fn().mockResolvedValue(new Map()),
      findNearDuplicateCandidateWindow: vi.fn().mockResolvedValue([])
    };
    const categorySuggestions = {
      suggestMany: vi
        .fn()
        .mockImplementation(async (_userId: string, targets: readonly unknown[]) =>
          targets.map(() => undefined)
        )
    };
    const categories = { list: vi.fn().mockResolvedValue([]) };
    const lines = Array.from(
      { length: 201 },
      (_, index) => `2026-07-01,-${index + 1}.00,Item ${index}`
    );
    const csv = ["Date,Amount,Description", ...lines].join("\n");
    const { service } = createService({
      batches,
      stagedRows,
      transactions,
      categorySuggestions,
      categories
    });

    await service.parseFile(BATCH_ID, "u1", ACCOUNT_ID, MAPPING, csv);

    expect(stagedRows.insertMany).toHaveBeenCalledTimes(2);
    expect(stagedRows.insertMany.mock.calls[0]?.[2]).toHaveLength(200);
    expect(stagedRows.insertMany.mock.calls[1]?.[2]).toHaveLength(1);
  });
});

describe("ImportsService reads and staged-row updates", () => {
  it("returns saved mappings and rejects an unknown account", async () => {
    const found = createService({
      accounts: { exists: vi.fn().mockResolvedValue(true) },
      batches: { findLatestMappingForAccount: vi.fn().mockResolvedValue(MAPPING) }
    });
    const missing = createService({
      accounts: { exists: vi.fn().mockResolvedValue(false) }
    });

    await expect(found.service.getSavedMapping("u1", ACCOUNT_ID)).resolves.toBe(MAPPING);
    await expect(missing.service.getSavedMapping("u1", ACCOUNT_ID)).rejects.toBeInstanceOf(
      EntityNotFoundError
    );
  });

  it("previews a known batch and rejects an unknown batch", async () => {
    const page = { items: [ROW], pageInfo: { nextCursor: null, hasMore: false, limit: 50 } };
    const found = createService({
      batches: { findById: vi.fn().mockResolvedValue(BATCH) },
      stagedRows: { findByBatchId: vi.fn().mockResolvedValue(page) }
    });
    const missing = createService({
      batches: { findById: vi.fn().mockResolvedValue(null) }
    });

    await expect(found.service.preview("u1", BATCH_ID, "cursor", 50)).resolves.toBe(page);
    await expect(missing.service.preview("u1", BATCH_ID, undefined, 50)).rejects.toBeInstanceOf(
      EntityNotFoundError
    );
  });

  it("updates a row without category validation when suggestion is absent or cleared", async () => {
    for (const patch of [{ include: false }, { suggestedCategoryId: null }]) {
      const stagedRows = { updateRow: vi.fn().mockResolvedValue(ROW) };
      const { service } = createService({
        batches: { findById: vi.fn().mockResolvedValue(BATCH) },
        stagedRows
      });
      await expect(service.updateRow("u1", BATCH_ID, ROW_ID, patch)).resolves.toBe(ROW);
    }
  });

  it("rejects missing batch, staged row, category, mismatched category, and failed update", async () => {
    const patch = { suggestedCategoryId: CATEGORY_ID };
    const scenarios = [
      createService({ batches: { findById: vi.fn().mockResolvedValue(null) } }),
      createService({
        batches: { findById: vi.fn().mockResolvedValue(BATCH) },
        stagedRows: {
          findById: vi.fn().mockResolvedValue(null),
          updateRow: vi.fn()
        },
        categories: { findActiveById: vi.fn().mockResolvedValue({ kind: "expense" }) }
      }),
      createService({
        batches: { findById: vi.fn().mockResolvedValue(BATCH) },
        stagedRows: { findById: vi.fn().mockResolvedValue(ROW), updateRow: vi.fn() },
        categories: { findActiveById: vi.fn().mockResolvedValue(null) }
      })
    ];

    for (const context of scenarios) {
      await expect(context.service.updateRow("u1", BATCH_ID, ROW_ID, patch)).rejects.toBeInstanceOf(
        EntityNotFoundError
      );
    }

    const mismatch = createService({
      batches: { findById: vi.fn().mockResolvedValue(BATCH) },
      stagedRows: { findById: vi.fn().mockResolvedValue(ROW), updateRow: vi.fn() },
      categories: { findActiveById: vi.fn().mockResolvedValue({ kind: "income" }) }
    });
    await expect(mismatch.service.updateRow("u1", BATCH_ID, ROW_ID, patch)).rejects.toBeInstanceOf(
      CategoryKindMismatchError
    );

    const failedUpdate = createService({
      batches: { findById: vi.fn().mockResolvedValue(BATCH) },
      stagedRows: { updateRow: vi.fn().mockResolvedValue(null) }
    });
    await expect(
      failedUpdate.service.updateRow("u1", BATCH_ID, ROW_ID, { include: true })
    ).rejects.toBeInstanceOf(EntityNotFoundError);
  });

  it("allows category assignment when an includable row has no parsed data", async () => {
    const unparsed = { ...ROW, parsed: undefined };
    const { service } = createService({
      batches: { findById: vi.fn().mockResolvedValue(BATCH) },
      stagedRows: {
        findById: vi.fn().mockResolvedValue(unparsed),
        updateRow: vi.fn().mockResolvedValue(unparsed)
      },
      categories: { findActiveById: vi.fn().mockResolvedValue({ kind: "income" }) }
    });

    await expect(
      service.updateRow("u1", BATCH_ID, ROW_ID, { suggestedCategoryId: CATEGORY_ID })
    ).resolves.toBe(unparsed);
  });
});

describe("ImportsService commit and revert", () => {
  it("rejects missing and incorrectly staged batches", async () => {
    const missing = createService({
      batches: { findById: vi.fn().mockResolvedValue(null) }
    });
    const pending = createService({
      batches: { findById: vi.fn().mockResolvedValue({ ...BATCH, status: "pending" }) }
    });

    await expect(missing.service.commitBatch("u1", BATCH_ID)).rejects.toBeInstanceOf(
      EntityNotFoundError
    );
    await expect(pending.service.commitBatch("u1", BATCH_ID)).rejects.toBeInstanceOf(
      ImportBatchNotReadyError
    );
  });

  it("commits income and expense rows with a zero net balance delta", async () => {
    const committed = { ...BATCH, status: "committed" as const };
    const batches = {
      findById: vi.fn().mockResolvedValueOnce(BATCH).mockResolvedValueOnce(committed),
      incrementCommittedCount: vi.fn().mockResolvedValue(undefined),
      markCommitted: vi.fn().mockResolvedValue(undefined)
    };
    const incomeRow = {
      ...ROW,
      id: "523e4567-e89b-42d3-a456-426614174000",
      dedupeFingerprintV2: "dedupe-2",
      parsed: { ...ROW.parsed, type: "income" as const }
    };
    const stagedRows = { findIncludableForBatch: vi.fn().mockResolvedValue([ROW, incomeRow]) };
    const transactions = {
      findExistingDedupeFingerprintsV2: vi.fn().mockResolvedValue(new Set()),
      insertImportedRows: vi.fn().mockResolvedValue([])
    };
    const accounts = { applyBalanceDelta: vi.fn() };
    const categories = {
      list: vi.fn().mockResolvedValue([{ id: CATEGORY_ID, kind: "expense" }])
    };
    const audit = { record: vi.fn().mockResolvedValue(undefined) };
    const { service } = createService({
      batches,
      stagedRows,
      transactions,
      accounts,
      categories,
      audit
    });

    // Remove the category from the income row so both kinds remain valid.
    incomeRow.suggestedCategoryId = undefined;
    await expect(service.commitBatch("u1", BATCH_ID)).resolves.toBe(committed);
    expect(accounts.applyBalanceDelta).not.toHaveBeenCalled();
    expect(batches.incrementCommittedCount).toHaveBeenCalledWith(
      "u1",
      BATCH_ID,
      2,
      expect.anything()
    );
  });

  it("skips already-landed rows and marks an empty remainder committed", async () => {
    const committed = { ...BATCH, status: "committed" as const };
    const batches = {
      findById: vi.fn().mockResolvedValueOnce(BATCH).mockResolvedValueOnce(committed),
      markCommitted: vi.fn().mockResolvedValue(undefined)
    };
    const transactions = {
      findExistingDedupeFingerprintsV2: vi.fn().mockResolvedValue(new Set(["dedupe-1"]))
    };
    const { service } = createService({
      batches,
      stagedRows: { findIncludableForBatch: vi.fn().mockResolvedValue([ROW]) },
      transactions,
      categories: { list: vi.fn().mockResolvedValue([]) }
    });

    await expect(service.commitBatch("u1", BATCH_ID)).resolves.toBe(committed);
    expect(batches.markCommitted).toHaveBeenCalledWith("u1", BATCH_ID);
  });

  it("records accepted, corrected, and dismissed feedback without narration labels", async () => {
    const committed = { ...BATCH, status: "committed" as const };
    const batches = {
      findById: vi.fn().mockResolvedValueOnce(BATCH).mockResolvedValueOnce(committed),
      markCommitted: vi.fn().mockResolvedValue(undefined)
    };
    const suggestion = {
      categoryId: CATEGORY_ID,
      confidenceBps: 9_000,
      method: "exact_counterparty" as const,
      evidenceCount: 3,
      algorithmVersion: 1
    };
    const accepted = { ...ROW, categorySuggestion: suggestion };
    const corrected = {
      ...ROW,
      id: "623e4567-e89b-42d3-a456-426614174000",
      dedupeFingerprintV2: "dedupe-2",
      suggestedCategoryId: "723e4567-e89b-42d3-a456-426614174000",
      categorySuggestion: suggestion
    };
    const dismissed = {
      ...ROW,
      id: "823e4567-e89b-42d3-a456-426614174000",
      dedupeFingerprintV2: "dedupe-3",
      suggestedCategoryId: undefined,
      categorySuggestion: suggestion
    };
    const metrics = { recordCategorySuggestions: vi.fn() };
    const { service } = createService({
      batches,
      stagedRows: {
        findIncludableForBatch: vi.fn().mockResolvedValue([accepted, corrected, dismissed])
      },
      transactions: {
        findExistingDedupeFingerprintsV2: vi
          .fn()
          .mockResolvedValue(new Set(["dedupe-1", "dedupe-2", "dedupe-3"]))
      },
      categories: { list: vi.fn().mockResolvedValue([]) },
      metrics
    });

    await service.commitBatch("u1", BATCH_ID);

    expect(metrics.recordCategorySuggestions.mock.calls).toEqual([
      ["accepted_unchanged", 1],
      ["corrected", 1],
      ["dismissed", 1]
    ]);
    expect(metrics.recordCategorySuggestions.mock.calls.flat()).not.toContain(
      ROW.parsed?.description
    );
  });

  it("rejects invalid includable rows and invalid category assignments", async () => {
    const base = {
      batches: { findById: vi.fn().mockResolvedValue(BATCH) },
      transactions: { findExistingDedupeFingerprintsV2: vi.fn().mockResolvedValue(new Set()) }
    };
    const invalidRow = { ...ROW, parsed: undefined };
    await expect(
      createService({
        ...base,
        stagedRows: { findIncludableForBatch: vi.fn().mockResolvedValue([invalidRow]) },
        categories: { list: vi.fn().mockResolvedValue([]) }
      }).service.commitBatch("u1", BATCH_ID)
    ).rejects.toThrow("marked includable");

    for (const category of [null, { id: CATEGORY_ID, kind: "income" }]) {
      const categories =
        category === null
          ? { list: vi.fn().mockResolvedValue([]) }
          : { list: vi.fn().mockResolvedValue([category]) };
      await expect(
        createService({
          ...base,
          stagedRows: { findIncludableForBatch: vi.fn().mockResolvedValue([ROW]) },
          categories
        }).service.commitBatch("u1", BATCH_ID)
      ).rejects.toBeInstanceOf(category === null ? EntityNotFoundError : CategoryKindMismatchError);
    }
  });

  it("rejects a missing account balance update and a missing final batch", async () => {
    const collaborators = {
      stagedRows: { findIncludableForBatch: vi.fn().mockResolvedValue([ROW]) },
      transactions: {
        findExistingDedupeFingerprintsV2: vi.fn().mockResolvedValue(new Set()),
        insertImportedRows: vi.fn().mockResolvedValue([])
      },
      categories: {
        list: vi.fn().mockResolvedValue([{ id: CATEGORY_ID, kind: "expense" }])
      }
    };
    const failedBalance = createService({
      ...collaborators,
      batches: { findById: vi.fn().mockResolvedValue(BATCH) },
      accounts: { applyBalanceDelta: vi.fn().mockResolvedValue("account_not_found") }
    });
    await expect(failedBalance.service.commitBatch("u1", BATCH_ID)).rejects.toBeInstanceOf(
      EntityNotFoundError
    );

    const missingFinal = createService({
      ...collaborators,
      batches: {
        findById: vi.fn().mockResolvedValueOnce(BATCH).mockResolvedValueOnce(null),
        incrementCommittedCount: vi.fn().mockResolvedValue(undefined),
        markCommitted: vi.fn().mockResolvedValue(undefined)
      },
      accounts: { applyBalanceDelta: vi.fn().mockResolvedValue("applied") }
    });
    await expect(missingFinal.service.commitBatch("u1", BATCH_ID)).rejects.toBeInstanceOf(
      EntityNotFoundError
    );
  });

  it("rejects missing and non-committed batches during revert", async () => {
    const missing = createService({
      batches: { findById: vi.fn().mockResolvedValue(null) }
    });
    const staged = createService({
      batches: { findById: vi.fn().mockResolvedValue(BATCH) }
    });

    await expect(missing.service.revertBatch("u1", BATCH_ID)).rejects.toBeInstanceOf(
      EntityNotFoundError
    );
    await expect(staged.service.revertBatch("u1", BATCH_ID)).rejects.toBeInstanceOf(
      ImportBatchNotReadyError
    );
  });

  it("reverts balanced income and expense chunks without updating the account", async () => {
    const committed = { ...BATCH, status: "committed" as const };
    const reverted = { ...BATCH, status: "reverted" as const };
    const batches = {
      findById: vi.fn().mockResolvedValueOnce(committed).mockResolvedValueOnce(reverted),
      markReverted: vi.fn().mockResolvedValue(undefined)
    };
    const transactions = {
      findPostedByImportBatchId: vi.fn().mockResolvedValue([
        { ...ROW.parsed, id: "tx-1", amountMinor: 5_000, type: "expense" },
        { ...ROW.parsed, id: "tx-2", amountMinor: 5_000, type: "income" }
      ]),
      insertBulkReversals: vi.fn().mockResolvedValue([])
    };
    const accounts = { applyReversalBalanceDelta: vi.fn() };
    const { service } = createService({ batches, transactions, accounts });

    await expect(service.revertBatch("u1", BATCH_ID)).resolves.toBe(reverted);
    expect(accounts.applyReversalBalanceDelta).not.toHaveBeenCalled();
  });

  it("rejects a missing reversal account and a missing final reverted batch", async () => {
    const committed = { ...BATCH, status: "committed" as const };
    const collaborators = {
      transactions: {
        findPostedByImportBatchId: vi
          .fn()
          .mockResolvedValue([{ ...ROW.parsed, id: "tx-1", type: "expense" }]),
        insertBulkReversals: vi.fn().mockResolvedValue([])
      }
    };
    const failedBalance = createService({
      ...collaborators,
      batches: { findById: vi.fn().mockResolvedValue(committed) },
      accounts: { applyReversalBalanceDelta: vi.fn().mockResolvedValue("account_not_found") }
    });
    await expect(failedBalance.service.revertBatch("u1", BATCH_ID)).rejects.toBeInstanceOf(
      EntityNotFoundError
    );

    const missingFinal = createService({
      ...collaborators,
      batches: {
        findById: vi.fn().mockResolvedValueOnce(committed).mockResolvedValueOnce(null),
        markReverted: vi.fn().mockResolvedValue(undefined)
      },
      accounts: { applyReversalBalanceDelta: vi.fn().mockResolvedValue("applied") }
    });
    await expect(missingFinal.service.revertBatch("u1", BATCH_ID)).rejects.toBeInstanceOf(
      EntityNotFoundError
    );
  });
});
