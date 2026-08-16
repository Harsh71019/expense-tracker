import { z } from "zod";

const SafeNonNegativeIntegerSchema = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const SafePositiveIntegerSchema = z.number().int().min(1).max(Number.MAX_SAFE_INTEGER);
const SafePositiveAmountSchema = z.number().int().min(1).max(Number.MAX_SAFE_INTEGER);
const BasisPointsSchema = z.number().int().min(0).max(10_000);
const CalendarDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const ReviewItemSourceTypeSchema = z.enum([
  "category_suggestion",
  "recurring_stream",
  "recurring_change",
  "spending_regime"
]);
export type ReviewItemSourceType = z.infer<typeof ReviewItemSourceTypeSchema>;

export const ReviewItemStatusSchema = z.enum([
  "active",
  "dismissed",
  "resolved",
  "stale",
  "superseded"
]);
export type ReviewItemStatus = z.infer<typeof ReviewItemStatusSchema>;

export const ReviewItemDismissReasonSchema = z.enum([
  "not_relevant",
  "incorrect",
  "already_handled",
  "wont_change",
  "other"
]);
export type ReviewItemDismissReason = z.infer<typeof ReviewItemDismissReasonSchema>;

export const ReviewItemFeedbackActionSchema = z.enum(["accepted", "rejected", "modified"]);
export type ReviewItemFeedbackAction = z.infer<typeof ReviewItemFeedbackActionSchema>;

export const ReviewItemPriorityFactorsSchema = z
  .object({
    uncertaintyBps: BasisPointsSchema,
    amountSignificanceBps: BasisPointsSchema,
    downstreamImpactBps: BasisPointsSchema,
    stalenessBps: BasisPointsSchema,
    compositeScore: BasisPointsSchema,
    explanation: z.string().min(1).max(500)
  })
  .readonly();
export type ReviewItemPriorityFactors = z.infer<typeof ReviewItemPriorityFactorsSchema>;

export const ReviewItemIdSchema = z.string().uuid();
export type ReviewItemId = z.infer<typeof ReviewItemIdSchema>;

export const ReviewItemSchema = z
  .object({
    id: ReviewItemIdSchema,
    userId: z.string().min(1),
    sourceType: ReviewItemSourceTypeSchema,
    sourceId: z.string().min(1),
    sourceVersion: SafePositiveIntegerSchema,
    status: ReviewItemStatusSchema,
    priorityScore: BasisPointsSchema,
    priorityFactors: ReviewItemPriorityFactorsSchema,
    title: z.string().min(1).max(200),
    subtitle: z.string().min(1).max(500),
    amountMinor: SafePositiveAmountSchema.nullable(),
    confidenceBps: BasisPointsSchema,
    evidence: z.record(z.string(), z.unknown()).readonly(),
    inputWatermark: z.record(z.string(), z.unknown()).readonly(),
    supersedesItemId: z.string().uuid().nullable(),
    occurredAt: z.coerce.date(),
    dismissedAt: z.coerce.date().nullable(),
    dismissReason: ReviewItemDismissReasonSchema.nullable(),
    resolvedAt: z.coerce.date().nullable(),
    feedbackAction: ReviewItemFeedbackActionSchema.nullable(),
    createdAt: z.coerce.date(),
    updatedAt: z.coerce.date()
  })
  .readonly();
export type ReviewItem = z.infer<typeof ReviewItemSchema>;

export const ReviewInboxSummarySchema = z
  .object({
    activeCount: SafeNonNegativeIntegerSchema,
    categorySuggestionCount: SafeNonNegativeIntegerSchema,
    recurringStreamCount: SafeNonNegativeIntegerSchema,
    recurringChangeCount: SafeNonNegativeIntegerSchema,
    spendingRegimeCount: SafeNonNegativeIntegerSchema,
    highestPriorityScore: BasisPointsSchema.nullable(),
    oldestActiveDate: CalendarDateSchema.nullable()
  })
  .readonly();
export type ReviewInboxSummary = z.infer<typeof ReviewInboxSummarySchema>;

export const ListReviewInboxQuerySchema = z.object({
  cursor: z.string().min(1).max(256).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  status: ReviewItemStatusSchema.optional().default("active"),
  sourceType: ReviewItemSourceTypeSchema.optional()
});
export type ListReviewInboxQuery = z.input<typeof ListReviewInboxQuerySchema>;
export type ParsedListReviewInboxQuery = z.output<typeof ListReviewInboxQuerySchema>;

export const ReviewInboxPageSchema = z
  .object({
    items: z.array(ReviewItemSchema).readonly(),
    nextCursor: z.string().min(1).max(256).nullable(),
    totalActive: SafeNonNegativeIntegerSchema
  })
  .readonly();
export type ReviewInboxPage = z.infer<typeof ReviewInboxPageSchema>;

export const DismissReviewItemRequestSchema = z
  .object({
    reason: ReviewItemDismissReasonSchema.optional().default("not_relevant")
  })
  .readonly();
export type DismissReviewItemRequest = z.infer<typeof DismissReviewItemRequestSchema>;

export const DismissReviewItemResponseSchema = z
  .object({
    item: ReviewItemSchema
  })
  .readonly();
export type DismissReviewItemResponse = z.infer<typeof DismissReviewItemResponseSchema>;

export const SubmitReviewFeedbackRequestSchema = z
  .object({
    action: ReviewItemFeedbackActionSchema,
    feedbackRating: z.number().int().min(1).max(5).optional(),
    notes: z.string().max(200).optional()
  })
  .readonly();
export type SubmitReviewFeedbackRequest = z.infer<typeof SubmitReviewFeedbackRequestSchema>;

export const SubmitReviewFeedbackResponseSchema = z
  .object({
    item: ReviewItemSchema,
    feedbackRecorded: z.boolean()
  })
  .readonly();
export type SubmitReviewFeedbackResponse = z.infer<typeof SubmitReviewFeedbackResponseSchema>;
