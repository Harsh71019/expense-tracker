import { z } from "zod";

import { CategoryIdSchema } from "./category.js";

export const CategorySuggestionMethodSchema = z.enum([
  "explicit_rule",
  "exact_counterparty",
  "jaro_winkler",
  "soft_tf_idf",
  "jaccard"
]);

/** Compact, narration-free provenance for a category recommendation. */
export const CategorySuggestionSchema = z
  .object({
    categoryId: CategoryIdSchema,
    confidenceBps: z.number().int().min(0).max(10_000),
    method: CategorySuggestionMethodSchema,
    evidenceCount: z.number().int().positive(),
    algorithmVersion: z.number().int().positive()
  })
  .readonly();

export type CategorySuggestionMethod = z.infer<typeof CategorySuggestionMethodSchema>;
export type CategorySuggestion = z.infer<typeof CategorySuggestionSchema>;
