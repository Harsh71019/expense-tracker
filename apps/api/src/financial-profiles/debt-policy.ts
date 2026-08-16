import {
  DeclaredDebtIdSchema,
  DeclaredDebtKindSchema,
  DeclaredDebtSchema,
  DeclaredDebtStatusSchema,
  HIGH_COST_DEBT_ANNUAL_RATE_BPS,
  isHighCostDebt,
  type DebtHighCostPolicy,
  type DeclaredDebt
} from "@treasury-ops/shared";
import { z } from "zod";

/**
 * @file Pure policy for declared debts: where a debt's outstanding amount comes
 * from, and what counts as high cost.
 *
 * The one rule worth stating twice: a debt linked to a `loan_liability` asset
 * has **no** outstanding amount of its own. Its number is derived, per read,
 * from that asset's latest valuation. Copying the valuation into the debt row
 * would create a second number that drifts from the first, and the ledger's
 * valuation is the one that is right.
 */

/** Raw persisted debt columns, parsed on the way out of the repository. */
export const StoredDeclaredDebtSchema = z.object({
  id: DeclaredDebtIdSchema,
  userId: z.string().min(1),
  name: z.string().min(1),
  kind: DeclaredDebtKindSchema,
  declaredOutstandingMinor: z.number().int().positive().nullable(),
  annualRateBps: z.number().int().min(0),
  minimumPaymentMinor: z.number().int().positive().nullable(),
  linkedAssetId: z.string().uuid().nullable(),
  status: DeclaredDebtStatusSchema,
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
  resolvedAt: z.coerce.date().nullable()
});

export type StoredDeclaredDebt = z.infer<typeof StoredDeclaredDebtSchema>;

/**
 * The slice of a linked asset a debt needs. Structural on purpose: the assets
 * module owns the real read contract, and this file must not reach into it.
 */
export type LinkedAssetFacts = Readonly<{
  name: string;
  isClosed: boolean;
  latestValuationMinor: number | null;
  latestValuationAt: Date | null;
}>;

/**
 * Composes the API response for one debt.
 *
 * A linked debt with no valuation yet — or whose asset has gone missing —
 * reports `outstandingMinor: null` rather than 0. An explicitly absent number
 * is honest; a zero would read as "nothing owed".
 */
export function toDeclaredDebt(
  stored: StoredDeclaredDebt,
  linkedAsset: LinkedAssetFacts | undefined
): DeclaredDebt {
  const linked = stored.linkedAssetId !== null;
  const valuationMinor = linkedAsset?.latestValuationMinor ?? null;

  return DeclaredDebtSchema.parse({
    id: stored.id,
    userId: stored.userId,
    name: stored.name,
    kind: stored.kind,
    declaredOutstandingMinor: stored.declaredOutstandingMinor,
    outstandingMinor: linked
      ? // A loan liability is valued negative; the amount owed is its magnitude.
        valuationMinor === null || valuationMinor === 0
        ? null
        : Math.abs(valuationMinor)
      : stored.declaredOutstandingMinor,
    annualRateBps: stored.annualRateBps,
    minimumPaymentMinor: stored.minimumPaymentMinor,
    linkedAssetId: stored.linkedAssetId,
    linkedAssetName: linked ? (linkedAsset?.name ?? null) : null,
    amountSource: linked ? "linked_asset" : "declared",
    valuationAsOf: linked ? (linkedAsset?.latestValuationAt ?? null) : null,
    // A declared amount is the user's own estimate and is labelled as such; a
    // linked amount comes from a recorded valuation and is not.
    isEstimate: !linked,
    isHighCost: isHighCostDebt(stored.annualRateBps),
    status: stored.status,
    createdAt: stored.createdAt,
    updatedAt: stored.updatedAt,
    resolvedAt: stored.resolvedAt
  });
}

/** The threshold travels with every page so no client hardcodes 12%. */
export function highCostPolicy(highCostCount: number): DebtHighCostPolicy {
  return {
    thresholdBps: HIGH_COST_DEBT_ANNUAL_RATE_BPS,
    comparison: "greater_than",
    highCostCount
  };
}
