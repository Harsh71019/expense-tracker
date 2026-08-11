import { z } from "zod";

import { AccountIdSchema } from "./account.js";
import { TransactionIdSchema, TransactionTypeSchema } from "./transaction.js";

const PositiveMinorSchema = z.number().int().min(1).max(Number.MAX_SAFE_INTEGER);

export const PendingTransactionIdSchema = z.string().uuid("Pending transaction id must be a UUID.");
export const PendingTransactionStatusSchema = z.enum(["pending", "confirmed", "dismissed"]);

export const CreatePendingTransactionSchema = z.object({
  accountId: AccountIdSchema,
  type: TransactionTypeSchema,
  occurredAt: z.coerce.date(),
  description: z.string().trim().min(1).max(500)
});

export const ConfirmPendingTransactionSchema = z.object({
  amountMinor: PositiveMinorSchema
});

export const ListPendingTransactionsQuerySchema = z.object({
  status: PendingTransactionStatusSchema.default("pending")
});

export const StoredPendingTransactionSchema = CreatePendingTransactionSchema.extend({
  id: PendingTransactionIdSchema,
  userId: z.string().min(1),
  status: PendingTransactionStatusSchema,
  resultingTransactionId: TransactionIdSchema.optional(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date()
});

export const PendingTransactionSchema = StoredPendingTransactionSchema;

export type PendingTransactionId = z.infer<typeof PendingTransactionIdSchema>;
export type PendingTransactionStatus = z.infer<typeof PendingTransactionStatusSchema>;
export type CreatePendingTransaction = z.infer<typeof CreatePendingTransactionSchema>;
export type ConfirmPendingTransaction = z.infer<typeof ConfirmPendingTransactionSchema>;
export type ListPendingTransactionsQuery = z.infer<typeof ListPendingTransactionsQuerySchema>;
export type StoredPendingTransaction = z.infer<typeof StoredPendingTransactionSchema>;
export type PendingTransaction = z.infer<typeof PendingTransactionSchema>;
