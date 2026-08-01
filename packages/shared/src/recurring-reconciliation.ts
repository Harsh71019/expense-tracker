import { z } from "zod";

import { RecurringRuleIdSchema } from "./recurring.js";
import { TransactionIdSchema } from "./transaction.js";

export const RecurringReconciliationIdSchema = z
  .string()
  .uuid("Recurring reconciliation id must be a UUID.");

export const RecurringReconciliationStatusSchema = z.enum([
  "auto_matched",
  "ambiguous",
  "amount_mismatch"
]);

export const RecurringReconciliationResolutionSchema = z.enum([
  "confirmed_duplicate",
  "confirmed_distinct"
]);

export const RecurringReconciliationSchema = z.object({
  id: RecurringReconciliationIdSchema,
  userId: z.string().min(1),
  incomingTransactionId: TransactionIdSchema,
  recurringRuleId: RecurringRuleIdSchema.optional(),
  recurringTransactionId: TransactionIdSchema.optional(),
  candidateRecurringTransactionIds: z.array(TransactionIdSchema),
  status: RecurringReconciliationStatusSchema,
  resolution: RecurringReconciliationResolutionSchema.optional(),
  resolvedAt: z.coerce.date().optional(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date()
});

/**
 * `chosenRecurringTransactionId` is only meaningful (and required) when
 * resolving an `ambiguous` row as `confirmed_duplicate` — that status by
 * definition has more than one tied candidate, so the human has to say which
 * one was actually superseded. The service layer validates the combination
 * (status vs. presence/absence of this field), since it depends on the
 * stored row, not just the shape of the request body.
 */
export const ResolveRecurringReconciliationSchema = z.object({
  resolution: RecurringReconciliationResolutionSchema,
  chosenRecurringTransactionId: TransactionIdSchema.optional()
});

export const ListRecurringReconciliationsQuerySchema = z.object({
  status: z.enum(["pending"]).optional()
});

export type RecurringReconciliationId = z.infer<typeof RecurringReconciliationIdSchema>;
export type RecurringReconciliationStatus = z.infer<typeof RecurringReconciliationStatusSchema>;
export type RecurringReconciliationResolution = z.infer<
  typeof RecurringReconciliationResolutionSchema
>;
export type RecurringReconciliation = z.infer<typeof RecurringReconciliationSchema>;
export type ResolveRecurringReconciliation = z.infer<typeof ResolveRecurringReconciliationSchema>;
export type ListRecurringReconciliationsQuery = z.infer<
  typeof ListRecurringReconciliationsQuerySchema
>;
