import { z } from "zod";

import { TransactionIdSchema, TransactionSourceSchema } from "./transaction.js";

const BasisPointsSchema = z.number().int().min(0).max(10_000);

export const NearDuplicateMethodSchema = z.enum([
  "exact_reference",
  "counterparty_key",
  "token_jaccard"
]);

export const NearDuplicateAbstentionReasonSchema = z.enum([
  "no_candidates",
  "insufficient_evidence"
]);

/**
 * Compact, narration-free provenance for a possible near-duplicate: enough for
 * a human reviewer to decide, never enough to reconstruct the raw narration.
 */
export const NearDuplicateEvidenceSchema = z
  .object({
    candidateTransactionId: TransactionIdSchema,
    method: NearDuplicateMethodSchema,
    confidenceBps: BasisPointsSchema,
    hasExactReferenceMatch: z.boolean(),
    hasCounterpartyKeyMatch: z.boolean(),
    tokenJaccardBps: BasisPointsSchema,
    calendarDayDistance: z.number().int().min(0).max(3_660),
    candidateSource: TransactionSourceSchema,
    algorithmVersion: z.number().int().positive()
  })
  .readonly();

/**
 * Explicit ambiguity/sufficiency/abstention contract: a "match" is advisory
 * review evidence, never an automatic rejection; "ambiguous" means at least
 * two candidates were too close to call; "abstained" means there was nothing
 * (or nothing sufficient) to compare against.
 */
export const NearDuplicateResultSchema = z.discriminatedUnion("outcome", [
  z.object({ outcome: z.literal("match"), evidence: NearDuplicateEvidenceSchema }).readonly(),
  z
    .object({
      outcome: z.literal("ambiguous"),
      candidateCount: z.number().int().min(2),
      topEvidence: NearDuplicateEvidenceSchema
    })
    .readonly(),
  z
    .object({
      outcome: z.literal("abstained"),
      reason: NearDuplicateAbstentionReasonSchema,
      algorithmVersion: z.number().int().positive()
    })
    .readonly()
]);

export type NearDuplicateMethod = z.infer<typeof NearDuplicateMethodSchema>;
export type NearDuplicateAbstentionReason = z.infer<typeof NearDuplicateAbstentionReasonSchema>;
export type NearDuplicateEvidence = z.infer<typeof NearDuplicateEvidenceSchema>;
export type NearDuplicateResult = z.infer<typeof NearDuplicateResultSchema>;
