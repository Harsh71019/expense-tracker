import { z } from "zod";

import { AccountIdSchema, AccountSchema, CreditCardConfigInputSchema } from "./account.js";
import { ColumnMappingSchema, ParsedRowSchema } from "./import.js";
import { PageInfoSchema } from "./pagination.js";
import { TransactionIdSchema, TransactionSchema, TransferSchema } from "./transaction.js";

const NonNegativeMinorSchema = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const PositiveMinorSchema = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const QueryBooleanSchema = z.preprocess((value) => {
  if (value === "true") return true;
  if (value === "false") return false;
  return value;
}, z.boolean());

export const CreditCardBillIdSchema = z.string().uuid("Bill id must be a UUID.");
export const BillStatementUploadIdSchema = z.string().uuid("Statement upload id must be a UUID.");
export const BillStatementRowIdSchema = z.string().uuid("Statement row id must be a UUID.");

export const BillReconciliationStatusSchema = z.enum(["awaiting_statement", "reconciled"]);
export const BillPaymentStatusSchema = z.enum(["unpaid", "partial", "paid"]);
export const BillStatementUploadStatusSchema = z.enum(["pending", "staged", "failed"]);
export const BillStatementRowMatchStatusSchema = z.enum([
  "matched",
  "missing_from_ledger",
  "ambiguous"
]);

export const CreditCardBillSchema = z.object({
  id: CreditCardBillIdSchema,
  userId: z.string().min(1),
  accountId: AccountIdSchema,
  cycleStart: z.coerce.date(),
  cycleEnd: z.coerce.date(),
  dueDate: z.coerce.date(),
  amountDueMinor: NonNegativeMinorSchema,
  reconciliationStatus: BillReconciliationStatusSchema,
  paidMinor: NonNegativeMinorSchema,
  remainingMinor: NonNegativeMinorSchema,
  paymentStatus: BillPaymentStatusSchema,
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date()
});

export const BillStatementStatsSchema = z.object({
  total: z.number().int().min(0),
  matched: z.number().int().min(0),
  missing: z.number().int().min(0),
  ambiguous: z.number().int().min(0),
  acknowledged: z.number().int().min(0)
});

export const BillStatementUploadSchema = z.object({
  id: BillStatementUploadIdSchema,
  userId: z.string().min(1),
  billId: CreditCardBillIdSchema,
  filename: z.string().min(1),
  fileHash: z.string().min(1),
  mapping: ColumnMappingSchema,
  status: BillStatementUploadStatusSchema,
  active: z.boolean(),
  stats: BillStatementStatsSchema,
  acknowledgedExtraTransactionIds: z.array(TransactionIdSchema),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date()
});

export const BillStatementRowSchema = z.object({
  id: BillStatementRowIdSchema,
  userId: z.string().min(1),
  uploadId: BillStatementUploadIdSchema,
  rowNumber: z.number().int().positive(),
  raw: z.record(z.string(), z.string()),
  parsed: ParsedRowSchema.optional(),
  matchedTransactionId: TransactionIdSchema.optional(),
  matchStatus: BillStatementRowMatchStatusSchema,
  acknowledged: z.boolean(),
  problems: z.array(z.string()),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date()
});

export const BillReconciliationSummarySchema = z.object({
  stats: BillStatementStatsSchema,
  unresolved: z.number().int().min(0),
  canReconcile: z.boolean(),
  extraTransactions: z.array(TransactionSchema)
});

export const BillDetailSchema = z.object({
  bill: CreditCardBillSchema,
  account: AccountSchema,
  activeStatement: BillStatementUploadSchema.optional(),
  reconciliation: BillReconciliationSummarySchema
});

export const ListBillsQuerySchema = z.object({
  accountId: AccountIdSchema.optional(),
  reconciliationStatus: BillReconciliationStatusSchema.optional(),
  paymentStatus: BillPaymentStatusSchema.optional(),
  cursor: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50)
});

export const BillPageSchema = z.object({
  items: z.array(CreditCardBillSchema),
  pageInfo: PageInfoSchema
});

export const ListBillStatementRowsQuerySchema = z.object({
  matchStatus: BillStatementRowMatchStatusSchema.optional(),
  acknowledged: QueryBooleanSchema.optional(),
  cursor: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50)
});

export const BillStatementRowPageSchema = z.object({
  items: z.array(BillStatementRowSchema),
  pageInfo: PageInfoSchema
});

export const UploadBillStatementMetadataSchema = z.object({
  mapping: ColumnMappingSchema
});

export const UpdateBillStatementRowSchema = z
  .object({
    matchedTransactionId: TransactionIdSchema.nullable().optional(),
    acknowledged: z.boolean().optional()
  })
  .refine(
    (value) =>
      (value.matchedTransactionId !== undefined ? 1 : 0) +
        (value.acknowledged !== undefined ? 1 : 0) ===
      1,
    { message: "Exactly one reconciliation action must be provided." }
  );

export const AcknowledgeExtraTransactionSchema = z.object({
  transactionId: TransactionIdSchema,
  acknowledged: z.boolean()
});

export const PayCreditCardBillSchema = z.object({
  fromAccountId: AccountIdSchema,
  amountMinor: PositiveMinorSchema,
  occurredAt: z.coerce.date()
});

export const BillPaymentResultSchema = z.object({
  bill: CreditCardBillSchema,
  transfer: TransferSchema
});

export const LinkBillPaymentSchema = z.object({
  transactionId: TransactionIdSchema,
  amountMinor: PositiveMinorSchema.optional()
});

export { CreditCardConfigInputSchema };

export type CreditCardBillId = z.infer<typeof CreditCardBillIdSchema>;
export type BillStatementUploadId = z.infer<typeof BillStatementUploadIdSchema>;
export type BillStatementRowId = z.infer<typeof BillStatementRowIdSchema>;
export type BillReconciliationStatus = z.infer<typeof BillReconciliationStatusSchema>;
export type BillPaymentStatus = z.infer<typeof BillPaymentStatusSchema>;
export type BillStatementUploadStatus = z.infer<typeof BillStatementUploadStatusSchema>;
export type BillStatementRowMatchStatus = z.infer<typeof BillStatementRowMatchStatusSchema>;
export type CreditCardBill = z.infer<typeof CreditCardBillSchema>;
export type BillStatementStats = z.infer<typeof BillStatementStatsSchema>;
export type BillStatementUpload = z.infer<typeof BillStatementUploadSchema>;
export type BillStatementRow = z.infer<typeof BillStatementRowSchema>;
export type BillReconciliationSummary = z.infer<typeof BillReconciliationSummarySchema>;
export type BillDetail = z.infer<typeof BillDetailSchema>;
export type ListBillsQuery = z.infer<typeof ListBillsQuerySchema>;
export type BillPage = z.infer<typeof BillPageSchema>;
export type ListBillStatementRowsQuery = z.infer<typeof ListBillStatementRowsQuerySchema>;
export type BillStatementRowPage = z.infer<typeof BillStatementRowPageSchema>;
export type UploadBillStatementMetadata = z.infer<typeof UploadBillStatementMetadataSchema>;
export type UpdateBillStatementRow = z.infer<typeof UpdateBillStatementRowSchema>;
export type AcknowledgeExtraTransaction = z.infer<typeof AcknowledgeExtraTransactionSchema>;
export type PayCreditCardBill = z.infer<typeof PayCreditCardBillSchema>;
export type BillPaymentResult = z.infer<typeof BillPaymentResultSchema>;
export type LinkBillPayment = z.infer<typeof LinkBillPaymentSchema>;
