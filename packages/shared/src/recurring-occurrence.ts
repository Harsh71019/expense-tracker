import { z } from "zod";

import { PageInfoSchema } from "./pagination.js";
import { RecurringRuleIdSchema } from "./recurring.js";
import { TransactionIdSchema } from "./transaction.js";

export const RecurringOccurrenceIdSchema = z
  .string()
  .uuid("Recurring occurrence id must be a UUID.");

/**
 * `missed` is never stored — the API derives it from `status === "expected"`
 * plus a grace period past `occurredAt` (see the backend's
 * RecurringOccurrenceRepository), so the database only ever persists
 * `expected` or `confirmed`.
 */
export const RecurringOccurrenceStatusSchema = z.enum(["expected", "confirmed", "missed"]);

export const RecurringOccurrenceSchema = z.object({
  id: RecurringOccurrenceIdSchema,
  userId: z.string().min(1),
  recurringRuleId: RecurringRuleIdSchema,
  occurredAt: z.coerce.date(),
  status: RecurringOccurrenceStatusSchema,
  confirmedTransactionId: TransactionIdSchema.optional(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date()
});

export const ListRecurringOccurrencesQuerySchema = z.object({
  cursor: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50)
});

export const RecurringOccurrencePageSchema = z.object({
  items: z.array(RecurringOccurrenceSchema),
  pageInfo: PageInfoSchema
});

export const LinkRecurringOccurrencePaymentSchema = z.object({
  transactionId: TransactionIdSchema
});

export type RecurringOccurrenceId = z.infer<typeof RecurringOccurrenceIdSchema>;
export type RecurringOccurrenceStatus = z.infer<typeof RecurringOccurrenceStatusSchema>;
export type RecurringOccurrence = z.infer<typeof RecurringOccurrenceSchema>;
export type ListRecurringOccurrencesQuery = z.infer<typeof ListRecurringOccurrencesQuerySchema>;
export type RecurringOccurrencePage = z.infer<typeof RecurringOccurrencePageSchema>;
export type LinkRecurringOccurrencePayment = z.infer<typeof LinkRecurringOccurrencePaymentSchema>;
