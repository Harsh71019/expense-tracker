import { Injectable } from "@nestjs/common";
import {
  calculateMarketValueMinor,
  type AssetId,
  type DisposalDeductions,
  type DisposalEstimateResult,
  type DisposalLotAllocation,
  type EstimateDisposalRequest,
  type MarketInstrumentType,
  type MarketQuoteWithFreshness,
  type TaxContextInput
} from "@treasury-ops/shared";

import {
  InsufficientDisposalContextError,
  MarketQuoteUnavailableError
} from "../common/errors/asset-market.error.js";
import { EntityNotFoundError } from "../common/errors/entity-not-found.error.js";
import { AssetMarketRepository } from "./asset-market.repository.js";
import { AssetPositionService } from "./asset-position.service.js";
import { AssetRepository } from "./asset.repository.js";
import { MarketQuoteRepository } from "./market-quote.repository.js";

const DEFAULT_LTCG_EXEMPTION_MINORS = 12_500_000; // ₹1,25,000 in paise (Section 112A)

type OpenLot = {
  eventId: string;
  occurredAt: Date;
  remainingMicroUnits: number;
  costPerUnitMicroRupees: number;
};

@Injectable()
export class DisposalEstimateService {
  constructor(
    private readonly assets: AssetRepository,
    private readonly market: AssetMarketRepository,
    private readonly quotes: MarketQuoteRepository,
    private readonly positions: AssetPositionService
  ) {}

  async estimateDisposal(
    userId: string,
    assetId: AssetId,
    request: EstimateDisposalRequest
  ): Promise<DisposalEstimateResult> {
    const asset = await this.assets.findById(userId, assetId);
    if (asset === null) throw new EntityNotFoundError("Asset");

    const activeLink = await this.market.findActiveLinkByAssetId(userId, assetId);
    const instrumentType: MarketInstrumentType = activeLink?.instrumentType ?? "mutual_fund";
    const currentPosition = await this.positions.getCurrentPosition(userId, assetId);

    // 1. Determine effective price per unit and quote
    let effectivePriceMicroRupeesPerUnit = request.quoteOverrideMicroRupeesPerUnit;
    let quoteWithFreshness: MarketQuoteWithFreshness | null = null;

    if (activeLink !== null) {
      const latestQuote = await this.quotes.findLatestByLink(userId, activeLink.id);
      if (latestQuote !== null) {
        if (effectivePriceMicroRupeesPerUnit === undefined) {
          effectivePriceMicroRupeesPerUnit = latestQuote.priceMicroRupeesPerQuoteUnit;
        }
        quoteWithFreshness = {
          ...latestQuote,
          freshness: computeFreshness(latestQuote.provider, latestQuote.providerAsOf)
        };
      }
    }

    if (effectivePriceMicroRupeesPerUnit === undefined || effectivePriceMicroRupeesPerUnit <= 0) {
      throw new MarketQuoteUnavailableError(
        "No current market quote is available to value this disposal. Please specify a quote override."
      );
    }

    // 2. Replay all position events to reconstruct FIFO lots
    const allEvents = await this.market.listAllPositionEventsByAsset(userId, assetId);
    const chronologicalEvents = [...allEvents].sort(
      (a, b) => a.occurredAt.getTime() - b.occurredAt.getTime() || a.id.localeCompare(b.id)
    );

    const reversedEventIds = new Set(
      chronologicalEvents
        .filter(
          (e): e is typeof e & { reversalOf: string } =>
            e.eventType === "reversal" && typeof e.reversalOf === "string"
        )
        .map((e) => e.reversalOf)
    );

    const openLots: OpenLot[] = [];

    for (const event of chronologicalEvents) {
      if (reversedEventIds.has(event.id) || event.eventType === "reversal") {
        continue;
      }

      if (
        event.eventType === "opening" ||
        event.eventType === "purchase" ||
        event.eventType === "reinvestment" ||
        event.eventType === "switch_in" ||
        event.eventType === "reconciliation_in"
      ) {
        let costPerUnit = 0;
        if (
          event.grossAmountMinor !== null &&
          event.grossAmountMinor !== undefined &&
          event.grossAmountMinor > 0 &&
          event.quantityMicroUnits > 0
        ) {
          costPerUnit = Math.round(
            (event.grossAmountMinor * 10_000 * 1_000_000) / event.quantityMicroUnits
          );
        } else {
          costPerUnit = effectivePriceMicroRupeesPerUnit;
        }

        openLots.push({
          eventId: event.id,
          occurredAt: event.occurredAt,
          remainingMicroUnits: event.quantityMicroUnits,
          costPerUnitMicroRupees: costPerUnit
        });
      } else if (
        event.eventType === "redemption" ||
        event.eventType === "switch_out" ||
        event.eventType === "reconciliation_out"
      ) {
        let unitsToDrain = event.quantityMicroUnits;
        for (const lot of openLots) {
          if (unitsToDrain <= 0) break;
          if (lot.remainingMicroUnits <= 0) continue;
          const drain = Math.min(lot.remainingMicroUnits, unitsToDrain);
          lot.remainingMicroUnits -= drain;
          unitsToDrain -= drain;
        }
      }
    }

    // 3. Target quantity to dispose (default to all current position)
    const totalAvailable = openLots.reduce((sum, lot) => sum + lot.remainingMicroUnits, 0);
    const targetQuantity =
      request.quantityMicroUnits !== undefined && request.quantityMicroUnits > 0
        ? request.quantityMicroUnits
        : currentPosition.quantityMicroUnits > 0
          ? currentPosition.quantityMicroUnits
          : totalAvailable;

    if (targetQuantity <= 0) {
      throw new InsufficientDisposalContextError(
        "Asset has zero holding units available to dispose."
      );
    }

    if (targetQuantity > totalAvailable) {
      throw new InsufficientDisposalContextError(
        `Requested disposal quantity (${String(targetQuantity / 1_000_000)} units) exceeds available holding balance (${String(totalAvailable / 1_000_000)} units).`
      );
    }

    const proposedDate = request.disposalDate;
    const lotAllocations: DisposalLotAllocation[] = [];
    let remainingToAllocate = targetQuantity;

    const taxRules = getTaxRules(instrumentType, request.taxContext);

    for (const lot of openLots) {
      if (remainingToAllocate <= 0) break;
      if (lot.remainingMicroUnits <= 0) continue;

      const allocatedUnits = Math.min(lot.remainingMicroUnits, remainingToAllocate);
      remainingToAllocate -= allocatedUnits;

      const holdingPeriodMonths = computeHoldingPeriodMonths(lot.occurredAt, proposedDate);
      const isLtcg = holdingPeriodMonths >= taxRules.ltcgHoldingMonthsThreshold;
      const term = isLtcg ? "long_term" : "short_term";

      const costBasisMinor = calculateMarketValueMinor(
        allocatedUnits,
        lot.costPerUnitMicroRupees,
        activeLink?.purityBps
      );
      const proceedsMinor = calculateMarketValueMinor(
        allocatedUnits,
        effectivePriceMicroRupeesPerUnit,
        activeLink?.purityBps
      );

      const gainLossMinor = proceedsMinor - costBasisMinor;

      lotAllocations.push({
        acquisitionEventId: lot.eventId,
        acquiredAt: lot.occurredAt,
        quantityMicroUnits: allocatedUnits,
        costBasisMinor,
        holdingPeriodMonths,
        term,
        gainLossMinor
      });
    }

    const grossProceedsMinor = calculateMarketValueMinor(
      targetQuantity,
      effectivePriceMicroRupeesPerUnit,
      activeLink?.purityBps
    );

    const totalCostBasisMinor = lotAllocations.reduce((acc, l) => acc + (l.costBasisMinor ?? 0), 0);
    const estimatedGainMinor = grossProceedsMinor - totalCostBasisMinor;

    // Deductions
    const otherChargesMinor = request.expectedOtherChargesMinor;
    let dealerDeductionsMinor = 0;
    if (request.dealerDeductionBps !== undefined && request.dealerDeductionBps > 0) {
      dealerDeductionsMinor = Math.round(
        (grossProceedsMinor * request.dealerDeductionBps) / 10_000
      );
    }

    const deductions: DisposalDeductions = {
      exitLoadMinor: 0,
      sttMinor: 0,
      dealerDeductionsMinor,
      otherChargesMinor,
      totalDeductionsMinor: dealerDeductionsMinor + otherChargesMinor
    };

    const cashSettlementMinor = Math.max(0, grossProceedsMinor - deductions.totalDeductionsMinor);

    // Tax computation
    const totalStcgGain = lotAllocations
      .filter((l) => l.term === "short_term" && (l.gainLossMinor ?? 0) > 0)
      .reduce((acc, l) => acc + (l.gainLossMinor ?? 0), 0);

    const totalLtcgGain = lotAllocations
      .filter((l) => l.term === "long_term" && (l.gainLossMinor ?? 0) > 0)
      .reduce((acc, l) => acc + (l.gainLossMinor ?? 0), 0);

    let ltcgExemptionAppliedMinor = 0;
    if (taxRules.eligibleForSection112AExemption && totalLtcgGain > 0) {
      const remainingExemption =
        request.taxContext?.equityLtcgExemptionRemainingMinor ?? DEFAULT_LTCG_EXEMPTION_MINORS;
      ltcgExemptionAppliedMinor = Math.min(totalLtcgGain, remainingExemption);
    }

    const netTaxableLtcgMinor = Math.max(0, totalLtcgGain - ltcgExemptionAppliedMinor);
    const netTaxableStcgMinor = totalStcgGain;

    const stcgTaxMinor = Math.round((netTaxableStcgMinor * taxRules.stcgRateBps) / 10_000);
    const ltcgTaxMinor = Math.round((netTaxableLtcgMinor * taxRules.ltcgRateBps) / 10_000);
    const estimatedTaxMinor = stcgTaxMinor + ltcgTaxMinor;

    const postTaxProceedsMinor = Math.max(0, cashSettlementMinor - estimatedTaxMinor);
    const effectiveTaxRateBps =
      estimatedGainMinor > 0 ? Math.round((estimatedTaxMinor / estimatedGainMinor) * 10_000) : 0;

    const assumptions = [
      `FIFO tax lot liquidation based on ${String(lotAllocations.length)} open position lot(s).`,
      `Tax rates applied: STCG ${String(taxRules.stcgRateBps / 100)}%, LTCG ${String(taxRules.ltcgRateBps / 100)}%.`
    ];
    if (ltcgExemptionAppliedMinor > 0) {
      assumptions.push(
        `Applied ₹${String(ltcgExemptionAppliedMinor / 100)} Section 112A equity LTCG exemption.`
      );
    }

    const warnings: string[] = ["Provisional estimation. Consult a tax advisor for filing."];
    if (activeLink === null) {
      warnings.push("Asset is not linked to live market data; default tax profile used.");
    }

    return {
      assetId,
      instrumentType,
      quantityMicroUnits: targetQuantity,
      quote: quoteWithFreshness,
      grossProceedsMinor,
      deductions,
      cashSettlementMinor,
      costBasisMinor: totalCostBasisMinor,
      estimatedGainMinor,
      estimatedTaxMinor,
      postTaxProceedsMinor,
      effectiveTaxRateBps,
      taxRuleId: `in_${instrumentType}_post2024`,
      taxSupportStatus: "supported",
      confidence: "estimate",
      lots: lotAllocations,
      assumptions,
      warnings
    };
  }
}

type TaxRuleDefinition = Readonly<{
  ltcgHoldingMonthsThreshold: number;
  stcgRateBps: number;
  ltcgRateBps: number;
  eligibleForSection112AExemption: boolean;
}>;

function getTaxRules(
  instrumentType: MarketInstrumentType,
  taxContext?: TaxContextInput
): TaxRuleDefinition {
  const slabRate = taxContext?.ordinaryIncomeTaxRateBps ?? 3000;
  switch (instrumentType) {
    case "mutual_fund":
      return {
        ltcgHoldingMonthsThreshold: 12,
        stcgRateBps: 2000, // 20% STCG post July 2024
        ltcgRateBps: 1250, // 12.5% LTCG post July 2024
        eligibleForSection112AExemption: true
      };
    case "physical_gold":
    case "physical_silver":
      return {
        ltcgHoldingMonthsThreshold: 24, // 24 months post July 2024
        stcgRateBps: slabRate,
        ltcgRateBps: 1250, // 12.5% without indexation
        eligibleForSection112AExemption: false
      };
    case "sgb":
      return {
        ltcgHoldingMonthsThreshold: 12,
        stcgRateBps: slabRate,
        ltcgRateBps: 1250,
        eligibleForSection112AExemption: false
      };
    default:
      return {
        ltcgHoldingMonthsThreshold: 12,
        stcgRateBps: 2000,
        ltcgRateBps: 1250,
        eligibleForSection112AExemption: false
      };
  }
}

function computeHoldingPeriodMonths(acquisitionDate: Date, disposalDate: Date): number {
  const yearsDiff = disposalDate.getUTCFullYear() - acquisitionDate.getUTCFullYear();
  const monthsDiff = disposalDate.getUTCMonth() - acquisitionDate.getUTCMonth();
  const daysDiff = disposalDate.getUTCDate() - acquisitionDate.getUTCDate();

  let totalMonths = yearsDiff * 12 + monthsDiff;
  if (daysDiff < 0) {
    totalMonths -= 1;
  }
  return Math.max(0, totalMonths);
}

function computeFreshness(
  provider: string,
  providerAsOf: Date
): "fresh" | "delayed" | "stale" | "unavailable" {
  const ageMs = Math.max(0, Date.now() - providerAsOf.getTime());
  const ageHours = Math.round(ageMs / 3_600_000);

  if (provider === "amfi") {
    if (ageHours <= 72) return "fresh";
    if (ageHours <= 168) return "delayed";
    return "stale";
  }
  if (provider === "goldapi") {
    if (ageHours <= 24) return "fresh";
    if (ageHours <= 48) return "delayed";
    return "stale";
  }
  if (ageHours <= 24) return "fresh";
  if (ageHours <= 72) return "delayed";
  return "stale";
}
