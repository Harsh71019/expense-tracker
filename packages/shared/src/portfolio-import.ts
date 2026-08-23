import { z } from "zod";

import { AssetIdSchema } from "./asset.js";
import { PriceMicroRupeesPerQuoteUnitSchema, QuantityMicroUnitsSchema } from "./fixed-point.js";
import { PositiveMinorAmountSchema } from "./money.js";
import { PageInfoSchema } from "./pagination.js";
import { MarketInstrumentTypeSchema } from "./asset-market.js";

export const PortfolioImportBatchIdSchema = z
  .string()
  .uuid("Portfolio import batch id must be a UUID.");
export const PortfolioImportRowIdSchema = z
  .string()
  .uuid("Portfolio import row id must be a UUID.");
export const PortfolioImportSourceSchema = z.enum(["kfintech_cams", "unknown"]);
export const PortfolioImportStatusSchema = z.enum([
  "queued",
  "parsing",
  "needs_review",
  "ready",
  "committing",
  "completed",
  "failed",
  "reverting",
  "reverted"
]);
export const PortfolioImportRowKindSchema = z.enum(["holding", "transaction"]);
export const PortfolioImportRowMatchStatusSchema = z.enum([
  "matched",
  "needs_confirmation",
  "unmatched",
  "ignored"
]);
export const PortfolioImportRowActionSchema = z.enum([
  "create_asset",
  "append_event",
  "reconcile",
  "ignore"
]);

const BatchCountsSchema = z.object({
  rowCount: z.number().int().nonnegative(),
  includedCount: z.number().int().nonnegative(),
  warningCount: z.number().int().nonnegative(),
  errorCount: z.number().int().nonnegative()
});

export const PortfolioImportBatchSchema = BatchCountsSchema.extend({
  id: PortfolioImportBatchIdSchema,
  userId: z.string().min(1),
  source: PortfolioImportSourceSchema,
  filename: z.string().min(1).max(255),
  fileHash: z.string().regex(/^[a-f0-9]{64}$/u),
  status: PortfolioImportStatusSchema,
  statementAsOf: z.coerce.date().optional(),
  coverageFrom: z.coerce.date().optional(),
  coverageTo: z.coerce.date().optional(),
  failureCode: z.string().min(1).max(100).optional(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
  completedAt: z.coerce.date().optional()
});

export const PortfolioImportRowSchema = z.object({
  id: PortfolioImportRowIdSchema,
  userId: z.string().min(1),
  batchId: PortfolioImportBatchIdSchema,
  rowNumber: z.number().int().positive(),
  rowKind: PortfolioImportRowKindSchema,
  semanticFingerprint: z.string().regex(/^[a-f0-9]{64}$/u),
  instrumentType: MarketInstrumentTypeSchema,
  isin: z.string().min(1).max(160).optional(),
  schemeCode: z.string().min(1).max(160).optional(),
  displayName: z.string().min(1).max(300),
  folioReferenceMasked: z.string().min(1).max(100).optional(),
  transactionType: z.string().min(1).max(100).optional(),
  occurredAt: z.coerce.date().optional(),
  quantityMicroUnits: QuantityMicroUnitsSchema.nullable(),
  grossAmountMinor: PositiveMinorAmountSchema.optional(),
  navMicroRupeesPerUnit: PriceMicroRupeesPerQuoteUnitSchema.optional(),
  proposedAssetId: AssetIdSchema.optional(),
  matchStatus: PortfolioImportRowMatchStatusSchema,
  proposedAction: PortfolioImportRowActionSchema,
  include: z.boolean(),
  warningCode: z.string().min(1).max(100).optional(),
  createdAt: z.coerce.date()
});

export const PortfolioImportRowPageSchema = z.object({
  items: z.array(PortfolioImportRowSchema),
  pageInfo: PageInfoSchema
});

export const UploadPortfolioImportMetadataSchema = z.object({
  password: z.string().min(1).max(256).optional(),
  source: PortfolioImportSourceSchema.default("unknown")
});

export const UpdatePortfolioImportRowSchema = z
  .object({
    proposedAssetId: AssetIdSchema.nullable().optional(),
    proposedAction: PortfolioImportRowActionSchema.optional(),
    include: z.boolean().optional()
  })
  .refine(
    (value) =>
      value.proposedAssetId !== undefined ||
      value.proposedAction !== undefined ||
      value.include !== undefined,
    "At least one review field is required."
  );

export const MAX_PORTFOLIO_IMPORT_FILE_SIZE_BYTES = 5 * 1024 * 1024;

export const PortfolioImportBatchCommitResultSchema = z.object({
  batch: PortfolioImportBatchSchema,
  committedRowCount: z.number().int().nonnegative()
});

export type PortfolioImportBatchId = z.infer<typeof PortfolioImportBatchIdSchema>;
export type PortfolioImportRowId = z.infer<typeof PortfolioImportRowIdSchema>;
export type PortfolioImportSource = z.infer<typeof PortfolioImportSourceSchema>;
export type PortfolioImportStatus = z.infer<typeof PortfolioImportStatusSchema>;
export type PortfolioImportRowKind = z.infer<typeof PortfolioImportRowKindSchema>;
export type PortfolioImportRowMatchStatus = z.infer<typeof PortfolioImportRowMatchStatusSchema>;
export type PortfolioImportRowAction = z.infer<typeof PortfolioImportRowActionSchema>;
export type PortfolioImportBatch = z.infer<typeof PortfolioImportBatchSchema>;
export type PortfolioImportRow = z.infer<typeof PortfolioImportRowSchema>;
export type PortfolioImportRowPage = z.infer<typeof PortfolioImportRowPageSchema>;
export type UploadPortfolioImportMetadata = z.infer<typeof UploadPortfolioImportMetadataSchema>;
export type UpdatePortfolioImportRow = z.infer<typeof UpdatePortfolioImportRowSchema>;
export type PortfolioImportBatchCommitResult = z.infer<
  typeof PortfolioImportBatchCommitResultSchema
>;
