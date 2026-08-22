import { z } from "zod";

import { AccountIdSchema } from "./account.js";
import { AssetIdSchema } from "./asset.js";
import { CategoryColorSchema, CategoryIconSchema, CategoryIdSchema } from "./category.js";
import { MonthSchema } from "./report.js";
import { PageInfoSchema } from "./pagination.js";
import { TransactionTextPaymentRailSchema } from "./transaction-text.js";

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
export const CreditCardBillReferenceIdSchema = z.string().uuid("Bill id must be a UUID.");
// Re-declared rather than imported from ./recurring.js to avoid a circular import
// (recurring.ts already imports TransactionTypeSchema from this module).
export const RecurringRuleReferenceIdSchema = z.string().uuid("Recurring rule id must be a UUID.");

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
  billId: CreditCardBillReferenceIdSchema.optional(),
  recurringRuleId: RecurringRuleReferenceIdSchema.optional(),
  paymentRail: TransactionTextPaymentRailSchema,
  counterpartyHandle: z.string().min(1).nullable(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
  assetFunding: z
    .object({
      fundingId: z.string().uuid("Asset funding id must be a UUID."),
      assetId: AssetIdSchema,
      assetName: z.string().min(1).max(80),
      assetKind: z.enum(["investment", "fixed_deposit"]),
      amountMinor: MinorAmountSchema
    })
    .optional()
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

export const BatchCategorizeTransactionsSchema = z.object({
  transactionIds: z
    .array(TransactionIdSchema)
    .min(1, "Select at least one transaction.")
    .max(200, "A batch can contain at most 200 transactions.")
    .refine((transactionIds) => new Set(transactionIds).size === transactionIds.length, {
      message: "Transaction ids must be unique."
    }),
  categoryId: CategoryIdSchema
});

export const BatchCategorizeTransactionsResultSchema = z.object({
  transactionIds: z.array(TransactionIdSchema).min(1).max(200),
  categoryId: CategoryIdSchema,
  updatedCount: z.number().int().min(1).max(200)
});

export const ListTransactionsQuerySchema = z
  .object({
    accountId: AccountIdSchema.optional(),
    categoryId: CategoryIdSchema.optional(),
    // Query values arrive as strings. Keep the filter optional internally so
    // existing callers without it retain the canonical list-query shape.
    uncategorized: z
      .union([z.literal("true"), z.literal("false")])
      .transform((value) => (value === "true" ? true : undefined))
      .optional(),
    from: z.coerce.date().optional(),
    to: z.coerce.date().optional(),
    q: z.string().trim().min(1).max(200).optional(),
    tag: z.string().trim().min(1).max(40).optional(),
    cursor: z.string().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(100).default(50)
  })
  .refine((value) => !(value.uncategorized === true && value.categoryId !== undefined), {
    message: "Category and uncategorized filters cannot be used together.",
    path: ["uncategorized"]
  });

export const TransactionPageSchema = z.object({
  items: z.array(TransactionSchema),
  pageInfo: PageInfoSchema
});

export const TransactionActivityDaySchema = z.object({
  date: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])-([0-2]\d|3[01])$/),
  transactionCount: z.number().int().min(0)
});

export const HighestMonthlyExpenseSchema = z.object({
  id: TransactionIdSchema,
  description: z.string().trim().min(1).max(500),
  amountMinor: MinorAmountSchema,
  occurredAt: z.coerce.date()
});

export const TopSpendingCategorySchema = z.object({
  categoryId: CategoryIdSchema.optional(),
  name: z.string().trim().min(1).max(80),
  color: CategoryColorSchema.optional(),
  icon: CategoryIconSchema.optional(),
  amountMinor: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER),
  transactionCount: z.number().int().min(1)
});

export const TransactionInsightsSchema = z.object({
  month: MonthSchema,
  monthlyTransactionCount: z.number().int().min(0),
  dailyActivity: z.array(TransactionActivityDaySchema),
  highestExpense: HighestMonthlyExpenseSchema.nullable(),
  topSpendingCategory: TopSpendingCategorySchema.nullable(),
  lifetimeTransactionCount: z.number().int().min(0)
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
export type BatchCategorizeTransactions = z.infer<typeof BatchCategorizeTransactionsSchema>;
export type BatchCategorizeTransactionsResult = z.infer<
  typeof BatchCategorizeTransactionsResultSchema
>;
export type Transaction = z.infer<typeof TransactionSchema>;
export type TransactionId = z.infer<typeof TransactionIdSchema>;
export type TransactionType = z.infer<typeof TransactionTypeSchema>;
export type ListTransactionsQuery = z.infer<typeof ListTransactionsQuerySchema>;
export type TransactionPage = z.infer<typeof TransactionPageSchema>;
export type TransactionActivityDay = z.infer<typeof TransactionActivityDaySchema>;
export type HighestMonthlyExpense = z.infer<typeof HighestMonthlyExpenseSchema>;
export type TopSpendingCategory = z.infer<typeof TopSpendingCategorySchema>;
export type TransactionInsights = z.infer<typeof TransactionInsightsSchema>;
export type CreateTransfer = z.infer<typeof CreateTransferSchema>;
export type Transfer = z.infer<typeof TransferSchema>;
export type TransferReversal = z.infer<typeof TransferReversalSchema>;
export type TransferGroupId = z.infer<typeof TransferGroupIdSchema>;
export type TransactionSource = z.infer<typeof TransactionSourceSchema>;
