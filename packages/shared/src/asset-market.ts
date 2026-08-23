import { z } from "zod";

import {
  PriceMicroRupeesPerQuoteUnitSchema,
  PurityBpsSchema,
  QuantityMicroUnitsSchema
} from "./fixed-point.js";
import { PositiveMinorAmountSchema } from "./money.js";
import { PageInfoSchema } from "./pagination.js";
import { AssetIdSchema } from "./asset.js";
import { AssetFundingIdSchema } from "./asset-funding.js";
import { TransactionIdSchema } from "./transaction.js";

export const AssetMarketLinkIdSchema = z.string().uuid("Asset market link id must be a UUID.");
export const AssetPositionEventIdSchema = z
  .string()
  .uuid("Asset position event id must be a UUID.");

export const MarketInstrumentTypeSchema = z.enum([
  "mutual_fund",
  "gold_etf",
  "silver_etf",
  "gold_fund",
  "silver_fund",
  "sgb",
  "physical_gold",
  "physical_silver"
]);

export const MarketDataProviderSchema = z.enum([
  "amfi",
  "ibja",
  "goldapi",
  "metalpriceapi",
  "manual"
]);

export const FundSchemePlanSchema = z.enum(["direct", "regular", "unknown"]);
export const FundSchemeOptionSchema = z.enum(["growth", "idcw", "unknown"]);
export const SgbAcquisitionChannelSchema = z.enum([
  "original_issue",
  "secondary_market",
  "unknown"
]);
export const MarketQuoteUnitSchema = z.enum(["fund_unit", "gram"]);

const OptionalIdentifierSchema = z.string().trim().min(1).max(160).optional();

export const CreateAssetMarketLinkSchema = z
  .object({
    assetId: AssetIdSchema,
    instrumentType: MarketInstrumentTypeSchema,
    provider: MarketDataProviderSchema,
    providerInstrumentId: z.string().trim().min(1).max(160),
    isin: OptionalIdentifierSchema,
    schemeCode: OptionalIdentifierSchema,
    schemePlan: FundSchemePlanSchema.optional(),
    schemeOption: FundSchemeOptionSchema.optional(),
    acquisitionChannel: SgbAcquisitionChannelSchema.optional(),
    quoteUnit: MarketQuoteUnitSchema,
    purityBps: PurityBpsSchema.optional(),
    autoValuationEnabled: z.boolean().default(true),
    effectiveFrom: z.coerce.date(),
    revisionOf: AssetMarketLinkIdSchema.optional()
  })
  .superRefine((value, context) => {
    const isPhysicalMetal =
      value.instrumentType === "physical_gold" || value.instrumentType === "physical_silver";
    if (isPhysicalMetal && value.quoteUnit !== "gram") {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Physical metal must use gram quote units.",
        path: ["quoteUnit"]
      });
    }
    if (!isPhysicalMetal && value.quoteUnit !== "fund_unit") {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Market instruments must use fund-unit quote units.",
        path: ["quoteUnit"]
      });
    }
    if (!isPhysicalMetal && value.purityBps !== undefined) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Purity only applies to physical metal.",
        path: ["purityBps"]
      });
    }
    if (value.instrumentType !== "sgb" && value.acquisitionChannel !== undefined) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Acquisition channel only applies to Sovereign Gold Bonds.",
        path: ["acquisitionChannel"]
      });
    }
  });

export const AssetMarketLinkSchema = CreateAssetMarketLinkSchema.extend({
  id: AssetMarketLinkIdSchema,
  userId: z.string().min(1),
  supersededAt: z.coerce.date().optional(),
  createdAt: z.coerce.date()
});

export const AssetPositionEventTypeSchema = z.enum([
  "opening",
  "purchase",
  "reinvestment",
  "switch_in",
  "redemption",
  "switch_out",
  "reconciliation_in",
  "reconciliation_out",
  "reversal"
]);

export const AssetPositionEventSourceSchema = z.enum([
  "manual",
  "cas",
  "broker_import",
  "legacy_backfill"
]);

export const CreateAssetPositionEventSchema = z
  .object({
    assetId: AssetIdSchema,
    eventType: AssetPositionEventTypeSchema,
    quantityMicroUnits: QuantityMicroUnitsSchema,
    grossAmountMinor: PositiveMinorAmountSchema.optional(),
    chargesMinor: PositiveMinorAmountSchema.optional(),
    taxesAtAcquisitionMinor: PositiveMinorAmountSchema.optional(),
    occurredAt: z.coerce.date(),
    transactionId: TransactionIdSchema.optional(),
    assetFundingId: AssetFundingIdSchema.optional(),
    source: AssetPositionEventSourceSchema,
    sourceReference: z.string().trim().min(1).max(200),
    portfolioImportRowId: z.string().uuid().optional(),
    reversalOf: AssetPositionEventIdSchema.optional()
  })
  .superRefine((value, context) => {
    if (value.eventType === "reversal" && value.reversalOf === undefined) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "A reversal event must identify the event it reverses.",
        path: ["reversalOf"]
      });
    }
    if (value.eventType !== "reversal" && value.reversalOf !== undefined) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Only reversal events may reference an original event.",
        path: ["reversalOf"]
      });
    }
  });

export const AssetPositionEventSchema = CreateAssetPositionEventSchema.extend({
  id: AssetPositionEventIdSchema,
  userId: z.string().min(1),
  createdAt: z.coerce.date()
});

export const AssetPositionEventPageSchema = z.object({
  items: z.array(AssetPositionEventSchema),
  pageInfo: PageInfoSchema
});

export const MarketPriceSchema = z.object({
  quoteUnit: MarketQuoteUnitSchema,
  priceMicroRupeesPerQuoteUnit: PriceMicroRupeesPerQuoteUnitSchema
});

export type AssetMarketLinkId = z.infer<typeof AssetMarketLinkIdSchema>;
export type AssetPositionEventId = z.infer<typeof AssetPositionEventIdSchema>;
export type MarketInstrumentType = z.infer<typeof MarketInstrumentTypeSchema>;
export type MarketDataProvider = z.infer<typeof MarketDataProviderSchema>;
export type FundSchemePlan = z.infer<typeof FundSchemePlanSchema>;
export type FundSchemeOption = z.infer<typeof FundSchemeOptionSchema>;
export type SgbAcquisitionChannel = z.infer<typeof SgbAcquisitionChannelSchema>;
export type MarketQuoteUnit = z.infer<typeof MarketQuoteUnitSchema>;
export type CreateAssetMarketLink = z.infer<typeof CreateAssetMarketLinkSchema>;
export type AssetMarketLink = z.infer<typeof AssetMarketLinkSchema>;
export type AssetPositionEventType = z.infer<typeof AssetPositionEventTypeSchema>;
export type AssetPositionEventSource = z.infer<typeof AssetPositionEventSourceSchema>;
export type CreateAssetPositionEvent = z.infer<typeof CreateAssetPositionEventSchema>;
export type AssetPositionEvent = z.infer<typeof AssetPositionEventSchema>;
export type AssetPositionEventPage = z.infer<typeof AssetPositionEventPageSchema>;
export type MarketPrice = z.infer<typeof MarketPriceSchema>;
