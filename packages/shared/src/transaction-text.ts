import { z } from "zod";

export const TransactionTextPaymentRailSchema = z.enum([
  "upi",
  "neft",
  "rtgs",
  "imps",
  "nach",
  "card",
  "unknown"
]);

export const TransactionTextDirectionHintSchema = z.enum(["debit", "credit", "unknown"]);

export const TransactionTextReferenceKindSchema = z.enum(["rrn", "utr", "order", "other"]);

export const TransactionTextReferenceTokenSchema = z
  .object({
    kind: TransactionTextReferenceKindSchema,
    value: z.string().min(1)
  })
  .readonly();

/**
 * Private, derived transaction text used only to improve one user's matching.
 * It is intentionally separate from the immutable source narration and can be
 * recomputed whenever the normalizer version changes.
 */
export const NormalizedTransactionTextSchema = z
  .object({
    normalized: z.string(),
    counterpartyKey: z.string().min(1).nullable(),
    paymentRail: TransactionTextPaymentRailSchema,
    counterpartyHandle: z.string().min(1).nullable(),
    directionHint: TransactionTextDirectionHintSchema,
    isFeeHint: z.boolean(),
    isRefundHint: z.boolean(),
    tokens: z.array(z.string().min(1)).readonly(),
    referenceTokens: z.array(TransactionTextReferenceTokenSchema).readonly(),
    normalizerVersion: z.number().int().positive()
  })
  .readonly();

export type TransactionTextPaymentRail = z.infer<typeof TransactionTextPaymentRailSchema>;
export type TransactionTextDirectionHint = z.infer<typeof TransactionTextDirectionHintSchema>;
export type TransactionTextReferenceKind = z.infer<typeof TransactionTextReferenceKindSchema>;
export type TransactionTextReferenceToken = z.infer<typeof TransactionTextReferenceTokenSchema>;
export type NormalizedTransactionText = z.infer<typeof NormalizedTransactionTextSchema>;
