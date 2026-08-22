import { z } from "zod";

import { AssetIdSchema, AssetSchema } from "./asset.js";
import { PositiveMinorAmountSchema } from "./money.js";
import { PageInfoSchema } from "./pagination.js";
import { TransactionIdSchema, TransactionSchema } from "./transaction.js";

export const AssetFundingIdSchema = z.string().uuid("Asset funding id must be a UUID.");
export const AssetFundingStatusSchema = z.enum(["posted", "reversed", "reversal"]);

export const AssetFundingSchema = z
  .object({
    id: AssetFundingIdSchema,
    userId: z.string().min(1),
    assetId: AssetIdSchema,
    transactionId: TransactionIdSchema,
    amountMinor: PositiveMinorAmountSchema,
    occurredAt: z.coerce.date(),
    status: AssetFundingStatusSchema,
    reversalOf: AssetFundingIdSchema.optional(),
    reversedBy: AssetFundingIdSchema.optional(),
    createdAt: z.coerce.date()
  })
  .superRefine((value, context) => {
    const validShape =
      (value.status === "posted" &&
        value.reversalOf === undefined &&
        value.reversedBy === undefined) ||
      (value.status === "reversed" &&
        value.reversalOf === undefined &&
        value.reversedBy !== undefined) ||
      (value.status === "reversal" &&
        value.reversalOf !== undefined &&
        value.reversedBy === undefined);
    if (!validShape) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Invalid asset funding lifecycle fields."
      });
    }
    if (value.reversalOf === value.id || value.reversedBy === value.id) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "An asset funding cannot reverse itself.",
        path: [value.reversalOf === value.id ? "reversalOf" : "reversedBy"]
      });
    }
  });

export const ExistingAssetFundingTargetSchema = z.object({
  kind: z.literal("existing_asset"),
  assetId: AssetIdSchema
});

export const NewFundedAssetSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("investment"), name: z.string().trim().min(1).max(80) }),
  z.object({
    kind: z.literal("fixed_deposit"),
    name: z.string().trim().min(1).max(80),
    maturityAt: z.string().datetime({ offset: false }).optional(),
    annualRateBps: z.number().int().min(0).max(10_000).optional()
  })
]);

export const AssetFundingTargetSchema = z.discriminatedUnion("kind", [
  ExistingAssetFundingTargetSchema,
  z.object({ kind: z.literal("new_asset"), asset: NewFundedAssetSchema })
]);

export const LinkTransactionToAssetSchema = z.object({ target: AssetFundingTargetSchema });

export const CreateInvestmentTransactionSchema = z.object({
  accountId: z.string().uuid("Account id must be a UUID."),
  amountMinor: PositiveMinorAmountSchema,
  occurredAt: z.string().datetime({ offset: false }),
  description: z.string().trim().min(1).max(500),
  tags: z.array(z.string().trim().min(1).max(40)).max(20).default([]),
  target: AssetFundingTargetSchema
});

export const AssetFundingMutationResultSchema = z.object({
  funding: AssetFundingSchema,
  transaction: TransactionSchema,
  asset: AssetSchema
});
export const ReverseAssetFundingResultSchema = z.object({
  original: AssetFundingSchema,
  reversal: AssetFundingSchema
});

export const ListAssetFundingsQuerySchema = z.object({
  cursor: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50)
});

export const AssetFundingPageSchema = z.object({
  items: z.array(AssetFundingSchema),
  pageInfo: PageInfoSchema
});

export type AssetFunding = z.infer<typeof AssetFundingSchema>;
export type AssetFundingId = z.infer<typeof AssetFundingIdSchema>;
export type AssetFundingStatus = z.infer<typeof AssetFundingStatusSchema>;
export type AssetFundingTarget = z.infer<typeof AssetFundingTargetSchema>;
export type LinkTransactionToAsset = z.infer<typeof LinkTransactionToAssetSchema>;
export type CreateInvestmentTransaction = z.infer<typeof CreateInvestmentTransactionSchema>;
export type AssetFundingMutationResult = z.infer<typeof AssetFundingMutationResultSchema>;
export type ReverseAssetFundingResult = z.infer<typeof ReverseAssetFundingResultSchema>;
export type ListAssetFundingsQuery = z.infer<typeof ListAssetFundingsQuerySchema>;
export type AssetFundingPage = z.infer<typeof AssetFundingPageSchema>;
