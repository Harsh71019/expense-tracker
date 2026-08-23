import { z } from "zod";

import { CreateAssetSchema, AssetSchema } from "./asset.js";
import {
  AssetMarketLinkSchema,
  AssetPositionEventSchema,
  CreateAssetMarketLinkRequestSchema,
  CreateManualAssetPositionEventSchema
} from "./asset-market.js";

const PhysicalInstrumentByAssetKind = {
  gold: "physical_gold",
  silver: "physical_silver"
} as const;

const MarketLinkedAssetFieldsSchema = z.object({
  asset: CreateAssetSchema,
  marketLink: CreateAssetMarketLinkRequestSchema,
  openingPosition: CreateManualAssetPositionEventSchema
});

function validateMarketLinkedAsset(
  value: z.infer<typeof MarketLinkedAssetFieldsSchema>,
  context: z.RefinementCtx
): void {
  if (value.openingPosition.eventType !== "opening") {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "A market-linked asset must begin with an opening position event.",
      path: ["openingPosition", "eventType"]
    });
  }

  if (value.asset.kind === "gold" || value.asset.kind === "silver") {
    const expectedInstrument = PhysicalInstrumentByAssetKind[value.asset.kind];
    if (value.marketLink.instrumentType !== expectedInstrument) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: `A ${value.asset.kind} asset must use the ${expectedInstrument} instrument.`,
        path: ["marketLink", "instrumentType"]
      });
    }
    if (value.openingPosition.quantityMicroUnits % 1_000 !== 0) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Physical-metal quantity must be exactly representable in milli-units.",
        path: ["openingPosition", "quantityMicroUnits"]
      });
    }
    return;
  }

  if (value.asset.kind !== "investment") {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Only investment, gold, and silver assets can have market positions.",
      path: ["asset", "kind"]
    });
    return;
  }

  if (
    value.marketLink.instrumentType === "physical_gold" ||
    value.marketLink.instrumentType === "physical_silver"
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Physical-metal instruments require a gold or silver asset.",
      path: ["marketLink", "instrumentType"]
    });
  }
}

export const CreateMarketLinkedAssetSchema =
  MarketLinkedAssetFieldsSchema.superRefine(validateMarketLinkedAsset);

export const MarketLinkedAssetCreationResultSchema = z.object({
  asset: AssetSchema,
  marketLink: AssetMarketLinkSchema,
  openingPosition: AssetPositionEventSchema
});

export type CreateMarketLinkedAsset = z.infer<typeof CreateMarketLinkedAssetSchema>;
export type MarketLinkedAssetCreationResult = z.infer<typeof MarketLinkedAssetCreationResultSchema>;
