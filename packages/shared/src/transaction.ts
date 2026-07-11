import { z } from "zod";

import { AccountIdSchema } from "./account.js";
import { CategoryIdSchema } from "./category.js";

const MinorAmountSchema = z.number().int().min(1).max(Number.MAX_SAFE_INTEGER);

export const TransactionTypeSchema = z.enum(["expense", "income"]);
export const TransactionStatusSchema = z.enum(["posted", "reversed", "reversal"]);
export const TransactionSourceSchema = z.enum(["manual", "csv_import", "recurring", "api"]);
export const TransactionIdSchema = z
  .string()
  .regex(/^[a-f\d]{24}$/i, "Transaction id must be a MongoDB ObjectId.");

export const CreateTransactionSchema = z.object({
  accountId: AccountIdSchema,
  categoryId: CategoryIdSchema.optional(),
  type: TransactionTypeSchema,
  amountMinor: MinorAmountSchema,
  occurredAt: z.coerce.date(),
  description: z.string().trim().min(1).max(500),
  tags: z.array(z.string().trim().min(1).max(40)).max(20).default([])
});

export const TransactionSchema = CreateTransactionSchema.extend({
  id: TransactionIdSchema,
  userId: z.string().min(1),
  currency: z.literal("INR"),
  source: TransactionSourceSchema,
  status: TransactionStatusSchema,
  idempotencyKey: z.string().uuid().optional(),
  reversalOf: TransactionIdSchema.optional(),
  reversedBy: TransactionIdSchema.optional(),
  createdAt: z.date(),
  updatedAt: z.date()
});

export type CreateTransaction = z.infer<typeof CreateTransactionSchema>;
export type Transaction = z.infer<typeof TransactionSchema>;
export type TransactionId = z.infer<typeof TransactionIdSchema>;
export type TransactionType = z.infer<typeof TransactionTypeSchema>;
