import { z } from "zod";

import { CategoryIdSchema, CategoryKindSchema } from "./category.js";

export const CATEGORY_RECOMMENDATION_ALGORITHM_VERSION = 2;
export const CATEGORY_RECOMMENDATION_LIMIT_MAX = 5;

const UtcDateTimeSchema = z
  .string()
  .refine(
    (value) => /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?Z$/.test(value),
    "occurredAt must be an ISO 8601 UTC date-time ending in Z."
  );

export const CategoryRecommendationQuerySchema = z
  .object({
    type: CategoryKindSchema,
    description: z.string().trim().min(1).max(500).optional(),
    occurredAt: UtcDateTimeSchema,
    limit: z.number().int().min(1).max(CATEGORY_RECOMMENDATION_LIMIT_MAX).default(5)
  })
  .strict();

export const CategoryRecommendationReasonSchema = z.enum([
  "explicit_rule",
  "exact_counterparty",
  "similar_description",
  "frequent",
  "recent"
]);

const CategoryRecommendationBaseSchema = z.object({
  categoryId: CategoryIdSchema,
  evidenceCount: z.number().int().positive(),
  algorithmVersion: z.number().int().positive()
});

export const CategoryRecommendationSchema = z
  .discriminatedUnion("reason", [
    CategoryRecommendationBaseSchema.extend({
      reason: z.enum(["explicit_rule", "exact_counterparty", "similar_description"]),
      confidenceBps: z.number().int().min(0).max(10_000)
    }).strict(),
    CategoryRecommendationBaseSchema.extend({
      reason: z.enum(["frequent", "recent"])
    }).strict()
  ])
  .readonly();

export const CategoryRecommendationResponseSchema = z
  .object({
    items: z.array(CategoryRecommendationSchema).max(CATEGORY_RECOMMENDATION_LIMIT_MAX),
    computedAt: z.coerce.date(),
    sourceThrough: z.coerce.date().nullable(),
    algorithmVersion: z.number().int().positive(),
    historyRowsConsidered: z.number().int().min(0).max(500),
    degraded: z.boolean()
  })
  .readonly();

export type CategoryRecommendationQuery = z.infer<typeof CategoryRecommendationQuerySchema>;
export type CategoryRecommendationReason = z.infer<typeof CategoryRecommendationReasonSchema>;
export type CategoryRecommendation = z.infer<typeof CategoryRecommendationSchema>;
export type CategoryRecommendationResponse = z.infer<typeof CategoryRecommendationResponseSchema>;

export type CategoryRecommendationInput = Readonly<{
  type: CategoryRecommendationQuery["type"];
  description?: string;
  occurredAt: Date;
  limit: number;
}>;

/** Canonical search/cache-key normalizer for category names and picker descriptions. */
export function normalizeCategorySearchText(value: string): string {
  return value.normalize("NFKC").trim().toLowerCase().replace(/\s+/g, " ");
}
