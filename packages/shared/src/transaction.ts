import { z } from "zod";

import { AccountIdSchema } from "./account.js";
import { CategoryIdSchema } from "./category.js";
import { PageInfoSchema } from "./pagination.js";

const MinorAmountSchema = z.number().int().min(1).max(Number.MAX_SAFE_INTEGER);

export const TransactionTypeSchema = z.enum(["expense", "income"]);
export const TransactionStatusSchema = z.enum(["posted", "reversed", "reversal"]);
export const TransactionSourceSchema = z.enum(["manual", "csv_import", "recurring", "api"]);
export const TransactionIdSchema = z.string().uuid("Transaction id must be a UUID.");

export const CreateTransactionSchema = z.object({
  accountId: AccountIdSchema,
  categoryId: CategoryIdSchema.optional(),
  type: TransactionTypeSchema,
  amountMinor: MinorAmountSchema,
  occurredAt: z.coerce.date(),
  description: z.string().trim().min(1).max(500),
  tags: z.array(z.string().trim().min(1).max(40)).max(20).default([])
});

export const TransferGroupIdSchema = z.string().uuid("Transfer group id must be a UUID.");

export const TransactionSchema = CreateTransactionSchema.extend({
  id: TransactionIdSchema,
  userId: z.string().min(1),
  currency: z.literal("INR"),
  source: TransactionSourceSchema,
  status: TransactionStatusSchema,
  idempotencyKey: z.string().uuid().optional(),
  reversalOf: TransactionIdSchema.optional(),
  reversedBy: TransactionIdSchema.optional(),
  transferGroupId: TransferGroupIdSchema.optional(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date()
});

export const UpdateTransactionSchema = z
  .object({
    description: z.string().trim().min(1).max(500).optional(),
    tags: z.array(z.string().trim().min(1).max(40)).max(20).optional(),
    categoryId: CategoryIdSchema.nullable().optional()
  })
  .refine(
    (value) =>
      value.description !== undefined || value.tags !== undefined || value.categoryId !== undefined,
    { message: "At least one field must be provided." }
  );

export const ListTransactionsQuerySchema = z.object({
  accountId: AccountIdSchema.optional(),
  categoryId: CategoryIdSchema.optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  q: z.string().trim().min(1).max(200).optional(),
  cursor: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50)
});

export const TransactionPageSchema = z.object({
  items: z.array(TransactionSchema),
  pageInfo: PageInfoSchema
});

export const CreateTransferSchema = z
  .object({
    fromAccountId: AccountIdSchema,
    toAccountId: AccountIdSchema,
    amountMinor: MinorAmountSchema,
    occurredAt: z.coerce.date(),
    description: z.string().trim().min(1).max(500),
    tags: z.array(z.string().trim().min(1).max(40)).max(20).default([])
  })
  .refine((value) => value.fromAccountId !== value.toAccountId, {
    message: "Transfer source and destination accounts must differ.",
    path: ["toAccountId"]
  });

export const TransferSchema = z.object({
  transferGroupId: TransferGroupIdSchema,
  fromTransaction: TransactionSchema,
  toTransaction: TransactionSchema
});

export const TransferReversalSchema = z.object({
  transferGroupId: TransferGroupIdSchema,
  legs: z.tuple([TransactionSchema, TransactionSchema])
});

export type CreateTransaction = z.infer<typeof CreateTransactionSchema>;
export type UpdateTransaction = z.infer<typeof UpdateTransactionSchema>;
export type Transaction = z.infer<typeof TransactionSchema>;
export type TransactionId = z.infer<typeof TransactionIdSchema>;
export type TransactionType = z.infer<typeof TransactionTypeSchema>;
export type ListTransactionsQuery = z.infer<typeof ListTransactionsQuerySchema>;
export type TransactionPage = z.infer<typeof TransactionPageSchema>;
export type CreateTransfer = z.infer<typeof CreateTransferSchema>;
export type Transfer = z.infer<typeof TransferSchema>;
export type TransferReversal = z.infer<typeof TransferReversalSchema>;
export type TransferGroupId = z.infer<typeof TransferGroupIdSchema>;
export type TransactionSource = z.infer<typeof TransactionSourceSchema>;
