import { z } from "zod";

import {
  PriceMicroRupeesPerQuoteUnitSchema,
  PurityBpsSchema,
  QuantityMicroUnitsSchema
} from "./fixed-point.js";
import { PositiveMinorAmountSchema } from "./money.js";
import { PageInfoSchema } from "./pagination.js";
import { AssetIdSchema, ValuationSchema, type AssetId } from "./asset.js";
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

const AssetMarketLinkFieldsSchema = z.object({
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
});

type MarketLinkValidationInput = Readonly<{
  instrumentType: z.infer<typeof MarketInstrumentTypeSchema>;
  quoteUnit: z.infer<typeof MarketQuoteUnitSchema>;
  purityBps?: z.infer<typeof PurityBpsSchema> | undefined;
  acquisitionChannel?: z.infer<typeof SgbAcquisitionChannelSchema> | undefined;
}>;

function validateMarketLink(value: MarketLinkValidationInput, context: z.RefinementCtx): void {
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
}

export const CreateAssetMarketLinkSchema =
  AssetMarketLinkFieldsSchema.superRefine(validateMarketLink);

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

const AssetPositionEventFieldsSchema = z.object({
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
});

function validatePositionEvent(
  value: z.infer<typeof AssetPositionEventFieldsSchema>,
  context: z.RefinementCtx
): void {
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
}

export const CreateAssetPositionEventSchema =
  AssetPositionEventFieldsSchema.superRefine(validatePositionEvent);

export const AssetPositionEventSchema = CreateAssetPositionEventSchema.extend({
  id: AssetPositionEventIdSchema,
  userId: z.string().min(1),
  createdAt: z.coerce.date()
});

export const AssetPositionEventPageSchema = z.object({
  items: z.array(AssetPositionEventSchema),
  pageInfo: PageInfoSchema
});

export const AssetCurrentPositionSchema = z.object({
  assetId: AssetIdSchema,
  quantityMicroUnits: z.number().int().min(Number.MIN_SAFE_INTEGER).max(Number.MAX_SAFE_INTEGER),
  eventCount: z.number().int().nonnegative(),
  asOf: z.coerce.date().nullable()
});

export const UtcDateTimeToDateSchema = z
  .string()
  .refine(
    (value) => /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?Z$/.test(value),
    "Timestamp must be an ISO 8601 UTC date-time ending in Z."
  )
  .transform((value) => new Date(value));

export const CreateAssetMarketLinkRequestSchema = AssetMarketLinkFieldsSchema.omit({
  assetId: true,
  revisionOf: true
})
  .extend({
    effectiveFrom: UtcDateTimeToDateSchema
  })
  .superRefine(validateMarketLink);

export const CreateManualAssetPositionEventSchema = AssetPositionEventFieldsSchema.omit({
  assetId: true,
  transactionId: true,
  assetFundingId: true,
  source: true,
  sourceReference: true,
  portfolioImportRowId: true,
  reversalOf: true
})
  .extend({
    occurredAt: UtcDateTimeToDateSchema
  })
  .superRefine((value, context) => {
    if (value.eventType === "reversal") {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Use the reversal resource to reverse a position event.",
        path: ["eventType"]
      });
    }
  });

export const ListAssetPositionEventsQuerySchema = z.object({
  cursor: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50)
});

export const ReverseAssetPositionEventResultSchema = z.object({
  original: AssetPositionEventSchema,
  reversal: AssetPositionEventSchema
});

export const MarketPriceSchema = z.object({
  quoteUnit: MarketQuoteUnitSchema,
  priceMicroRupeesPerQuoteUnit: PriceMicroRupeesPerQuoteUnitSchema
});

export const MarketQuoteIdSchema = z.string().uuid("Market quote id must be a UUID.");

export const MarketQuoteSchema = z.object({
  id: MarketQuoteIdSchema,
  userId: z.string().min(1),
  assetMarketLinkId: AssetMarketLinkIdSchema,
  provider: MarketDataProviderSchema,
  providerInstrumentId: z.string().trim().min(1).max(160),
  quoteUnit: MarketQuoteUnitSchema,
  priceMicroRupeesPerQuoteUnit: PriceMicroRupeesPerQuoteUnitSchema,
  providerAsOf: z.coerce.date(),
  fetchedAt: z.coerce.date(),
  createdAt: z.coerce.date()
});

export const MarketValuationSchema = z.object({
  assetId: AssetIdSchema,
  quote: MarketQuoteSchema,
  quantityMicroUnits: QuantityMicroUnitsSchema,
  valueMinor: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  valuedAt: z.coerce.date()
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
export type CreateAssetMarketLinkRequest = z.infer<typeof CreateAssetMarketLinkRequestSchema>;
export type AssetMarketLink = z.infer<typeof AssetMarketLinkSchema>;
export type AssetPositionEventType = z.infer<typeof AssetPositionEventTypeSchema>;
export type AssetPositionEventSource = z.infer<typeof AssetPositionEventSourceSchema>;
export type CreateAssetPositionEvent = z.infer<typeof CreateAssetPositionEventSchema>;
export type CreateManualAssetPositionEvent = z.infer<typeof CreateManualAssetPositionEventSchema>;
export type AssetPositionEvent = z.infer<typeof AssetPositionEventSchema>;
export type AssetPositionEventPage = z.infer<typeof AssetPositionEventPageSchema>;
export type AssetCurrentPosition = z.infer<typeof AssetCurrentPositionSchema>;
export type ListAssetPositionEventsQuery = z.infer<typeof ListAssetPositionEventsQuerySchema>;

const InboundPositionEventTypes = new Set<AssetPositionEventType>([
  "opening",
  "purchase",
  "reinvestment",
  "switch_in",
  "reconciliation_in"
]);

/**
 * Replays an append-only position stream without mutating event history.
 * Reversals negate the original event's direction and are intentionally not
 * interpreted as a generic outbound event.
 */
export function deriveAssetCurrentPosition(
  assetId: AssetId,
  events: readonly AssetPositionEvent[]
): AssetCurrentPosition {
  const eventsById = new Map(events.map((event) => [event.id, event]));
  let quantity = 0n;
  for (const event of events) {
    const direction = positionEventDirection(event, eventsById);
    quantity += direction * BigInt(event.quantityMicroUnits);
  }
  if (quantity < BigInt(Number.MIN_SAFE_INTEGER) || quantity > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new RangeError("Current position exceeds the supported safe-integer range.");
  }
  const latest = events.reduce<AssetPositionEvent | undefined>(
    (current, event) =>
      current === undefined || event.occurredAt > current.occurredAt ? event : current,
    undefined
  );
  return AssetCurrentPositionSchema.parse({
    assetId,
    quantityMicroUnits: Number(quantity),
    eventCount: events.length,
    asOf: latest?.occurredAt ?? null
  });
}

function positionEventDirection(
  event: AssetPositionEvent,
  eventsById: ReadonlyMap<AssetPositionEventId, AssetPositionEvent>
): bigint {
  if (event.eventType !== "reversal") {
    return InboundPositionEventTypes.has(event.eventType) ? 1n : -1n;
  }
  if (event.reversalOf === undefined) {
    throw new RangeError("A reversal event is missing its original event reference.");
  }
  const original = eventsById.get(event.reversalOf);
  if (original === undefined || original.eventType === "reversal") {
    throw new RangeError("A reversal event references an invalid original event.");
  }
  return InboundPositionEventTypes.has(original.eventType) ? -1n : 1n;
}
export type ReverseAssetPositionEventResult = z.infer<typeof ReverseAssetPositionEventResultSchema>;
export type MarketPrice = z.infer<typeof MarketPriceSchema>;
export type MarketQuoteId = z.infer<typeof MarketQuoteIdSchema>;
export type MarketQuote = z.infer<typeof MarketQuoteSchema>;
export type MarketValuation = z.infer<typeof MarketValuationSchema>;

export const MarketInstrumentItemSchema = z.object({
  instrumentType: MarketInstrumentTypeSchema,
  provider: MarketDataProviderSchema,
  providerInstrumentId: z.string().min(1).max(160),
  schemeCode: z.string().min(1).max(160).optional(),
  isin: z.string().min(1).max(160).optional(),
  name: z.string().min(1).max(300),
  schemePlan: FundSchemePlanSchema.optional(),
  schemeOption: FundSchemeOptionSchema.optional(),
  quoteUnit: MarketQuoteUnitSchema
});

export const MarketInstrumentPageSchema = z.object({
  items: z.array(MarketInstrumentItemSchema),
  pageInfo: PageInfoSchema
});

export const ListMarketInstrumentsQuerySchema = z.object({
  type: MarketInstrumentTypeSchema.optional(),
  q: z.string().trim().min(1).max(100).optional(),
  cursor: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50)
});

export const MarketQuoteFreshnessSchema = z.enum(["fresh", "delayed", "stale", "unavailable"]);

export const MarketQuoteWithFreshnessSchema = MarketQuoteSchema.extend({
  freshness: MarketQuoteFreshnessSchema
});

export const AssetMarketValuationDetailsSchema = z.object({
  assetId: AssetIdSchema,
  position: AssetCurrentPositionSchema,
  quote: MarketQuoteWithFreshnessSchema.nullable(),
  valuation: ValuationSchema.nullable(),
  estimatedValueMinor: z.number().int().nonnegative().nullable(),
  asOf: z.coerce.date().nullable(),
  lastReconciledAt: z.coerce.date().nullable(),
  warnings: z.array(z.string())
});

export const TaxpayerTypeSchema = z.enum(["resident_individual", "nri", "huf", "company", "other"]);

export const TaxContextInputSchema = z.object({
  taxYear: z
    .string()
    .regex(/^\d{4}-\d{2}$/u, "Tax year format must be YYYY-YY (e.g. 2026-27).")
    .default("2026-27"),
  taxpayerType: TaxpayerTypeSchema.default("resident_individual"),
  ordinaryIncomeTaxRateBps: z.number().int().min(0).max(10000).optional(),
  surchargeRateBps: z.number().int().min(0).max(10000).optional(),
  equityLtcgExemptionRemainingMinor: z.number().int().min(0).max(12500000).optional(),
  capitalLossOffsetMinor: z.number().int().min(0).optional()
});

export const EstimateDisposalRequestSchema = z.object({
  quantityMicroUnits: QuantityMicroUnitsSchema.optional(),
  disposalDate: z.coerce.date().default(() => new Date()),
  quoteOverrideMicroRupeesPerUnit: PriceMicroRupeesPerQuoteUnitSchema.optional(),
  expectedOtherChargesMinor: z.number().int().min(0).default(0),
  dealerDeductionBps: z.number().int().min(0).max(10000).optional(),
  taxContext: TaxContextInputSchema.optional()
});

export const DisposalDeductionsSchema = z.object({
  exitLoadMinor: z.number().int().nonnegative(),
  sttMinor: z.number().int().nonnegative(),
  dealerDeductionsMinor: z.number().int().nonnegative(),
  otherChargesMinor: z.number().int().nonnegative(),
  totalDeductionsMinor: z.number().int().nonnegative()
});

export const DisposalLotAllocationSchema = z.object({
  acquisitionEventId: AssetPositionEventIdSchema.optional(),
  acquiredAt: z.coerce.date().nullable(),
  quantityMicroUnits: QuantityMicroUnitsSchema,
  costBasisMinor: z.number().int().nonnegative().nullable(),
  holdingPeriodMonths: z.number().nonnegative().nullable(),
  term: z.enum(["short_term", "long_term", "unknown"]),
  gainLossMinor: z.number().int().nullable()
});

export const DisposalEstimateResultSchema = z.object({
  assetId: AssetIdSchema,
  instrumentType: MarketInstrumentTypeSchema.optional(),
  quantityMicroUnits: QuantityMicroUnitsSchema,
  quote: MarketQuoteWithFreshnessSchema.nullable(),
  grossProceedsMinor: z.number().int().nonnegative(),
  deductions: DisposalDeductionsSchema,
  cashSettlementMinor: z.number().int().nonnegative(),
  costBasisMinor: z.number().int().nonnegative().nullable(),
  estimatedGainMinor: z.number().int().nullable(),
  estimatedTaxMinor: z.number().int().nonnegative().nullable(),
  postTaxProceedsMinor: z.number().int().nonnegative().nullable(),
  effectiveTaxRateBps: z.number().int().nonnegative().nullable(),
  taxRuleId: z.string().nullable(),
  taxSupportStatus: z.enum([
    "supported",
    "unsupported_tax_context",
    "missing_cost_basis",
    "missing_quote"
  ]),
  confidence: z.enum(["estimate", "provisional", "unsupported"]),
  lots: z.array(DisposalLotAllocationSchema),
  assumptions: z.array(z.string()),
  warnings: z.array(z.string())
});

export type MarketInstrumentItem = z.infer<typeof MarketInstrumentItemSchema>;
export type MarketInstrumentPage = z.infer<typeof MarketInstrumentPageSchema>;
export type ListMarketInstrumentsQuery = z.infer<typeof ListMarketInstrumentsQuerySchema>;
export type MarketQuoteFreshness = z.infer<typeof MarketQuoteFreshnessSchema>;
export type MarketQuoteWithFreshness = z.infer<typeof MarketQuoteWithFreshnessSchema>;
export type AssetMarketValuationDetails = z.infer<typeof AssetMarketValuationDetailsSchema>;
export type TaxpayerType = z.infer<typeof TaxpayerTypeSchema>;
export type TaxContextInput = z.infer<typeof TaxContextInputSchema>;
export type EstimateDisposalRequest = z.infer<typeof EstimateDisposalRequestSchema>;
export type DisposalDeductions = z.infer<typeof DisposalDeductionsSchema>;
export type DisposalLotAllocation = z.infer<typeof DisposalLotAllocationSchema>;
export type DisposalEstimateResult = z.infer<typeof DisposalEstimateResultSchema>;
