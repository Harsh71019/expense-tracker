import type { ReviewItemPriorityFactors, ReviewItemSourceType } from "@treasury-ops/shared";

import { requireSafeInteger } from "../common/statistics/index.js";

export interface PriorityCalculationInput {
  readonly sourceType: ReviewItemSourceType;
  readonly confidenceBps: number;
  readonly amountMinor: number | null;
  readonly referenceScaleMinor?: number;
  readonly occurredAt: Date;
  readonly asOf: Date;
  readonly customReason?: string | undefined;
}

const DEFAULT_REFERENCE_SCALE_MINOR = 5_000_000; // 50,000 INR default monthly reference scale

const SOURCE_IMPACT_BPS: Record<ReviewItemSourceType, number> = {
  recurring_change: 8_500,
  spending_regime: 7_500,
  recurring_stream: 6_000,
  category_suggestion: 4_000
};

/**
 * Pure, deterministic, fixed-point priority calculator for review inbox items.
 * Combines:
 * - Uncertainty (35%): (10,000 - confidenceBps)
 * - Amount Significance (30%): amount relative to reference scale
 * - Downstream Impact (25%): recurrence/regime impact leverage
 * - Staleness (10%): days elapsed since occurrence/detection
 */
export function calculateReviewPriority(
  input: PriorityCalculationInput
): ReviewItemPriorityFactors {
  requireSafeInteger(input.confidenceBps, "confidenceBps");
  const clampedConfidence = Math.max(0, Math.min(10_000, input.confidenceBps));
  const uncertaintyBps = 10_000 - clampedConfidence;

  const referenceScale = input.referenceScaleMinor ?? DEFAULT_REFERENCE_SCALE_MINOR;
  requireSafeInteger(referenceScale, "referenceScaleMinor");
  if (referenceScale < 0) throw new RangeError("referenceScaleMinor must be non-negative");

  let amountSignificanceBps = 1_000;
  if (input.amountMinor !== null && input.amountMinor > 0 && referenceScale > 0) {
    requireSafeInteger(input.amountMinor, "amountMinor");
    const scaled = Math.floor((input.amountMinor * 10_000) / referenceScale);
    amountSignificanceBps = Math.max(500, Math.min(10_000, scaled));
  }

  const downstreamImpactBps = SOURCE_IMPACT_BPS[input.sourceType];

  const diffMs = Math.max(0, input.asOf.getTime() - input.occurredAt.getTime());
  const elapsedDays = Math.floor(diffMs / 86_400_000);
  const stalenessBps = Math.min(10_000, elapsedDays * 200);

  // Integer arithmetic: weights sum to 100
  const rawComposite = Math.floor(
    (uncertaintyBps * 35 +
      amountSignificanceBps * 30 +
      downstreamImpactBps * 25 +
      stalenessBps * 10) /
      100
  );

  const compositeScore = Math.max(0, Math.min(10_000, rawComposite));

  const explanation = generatePriorityExplanation(
    input.sourceType,
    compositeScore,
    uncertaintyBps,
    amountSignificanceBps,
    downstreamImpactBps,
    input.customReason
  );

  return {
    uncertaintyBps,
    amountSignificanceBps,
    downstreamImpactBps,
    stalenessBps,
    compositeScore,
    explanation
  };
}

function generatePriorityExplanation(
  sourceType: ReviewItemSourceType,
  score: number,
  uncertaintyBps: number,
  amountSignificanceBps: number,
  downstreamImpactBps: number,
  customReason?: string
): string {
  if (customReason && customReason.trim().length > 0) {
    return customReason.trim();
  }

  const urgencyTier = score >= 7_000 ? "High" : score >= 4_000 ? "Medium" : "Low";

  switch (sourceType) {
    case "recurring_change":
      return `${urgencyTier} priority: Persistent recurring cost change with significant downstream cashflow impact.`;
    case "spending_regime":
      return `${urgencyTier} priority: Variable lifestyle spending regime shift detected across weekly intervals.`;
    case "recurring_stream":
      return `${urgencyTier} priority: Candidate recurring commitment with ${Math.round((10_000 - uncertaintyBps) / 100)}% detection confidence.`;
    case "category_suggestion":
      return `${urgencyTier} priority: Uncategorized transaction with category suggestion requiring review.`;
  }
}
