import type {
  ReserveLiquidityTier,
  ReserveSourceKind,
  ReserveSourceType
} from "@treasury-ops/shared";

/**
 * Write-time source/tier policy. Single source of truth for which
 * `(sourceKind, sourceType)` combinations may be classified at all, and
 * which liquidity tiers a classifiable source may use -- enforced only here,
 * at configuration write time, so the evaluator never needs a second copy of
 * this policy (see reserve-value-evaluator.ts's structural-exclusion note).
 *
 * Decisions and why (documented per
 * docs/features/02-safety-ladder-runway/02-emergency-reserve-sources/backend.md
 * §5's "document and test any different decision" requirement):
 * - `credit_card` accounts: never configurable. A credit card balance is a
 *   liability, never a reserve.
 * - `investment` accounts: never configurable in V1. The account balance
 *   would double count against any investment *asset* the user separately
 *   classifies, and there is no reliable way to distinguish "this investment
 *   account's balance is not also represented by an asset record" from the
 *   existing domain model. Users classify investment liquidity at the asset
 *   level instead.
 * - `loan_liability` / `loan_receivable` assets: never configurable. These
 *   are debts, not reserves.
 * - `gold` / `silver`: locked-only. Selling physical or paper precious
 *   metal is not same-day or next-day cash in the general case, so V1 does
 *   not offer instant/T+1 for these kinds even though the underlying market
 *   link may support fast liquidation for some instruments.
 * - `investment` assets: T+1 or locked, never instant. Redemption of a fund
 *   or market position always settles at least a day out.
 * - `bank` / `cash` / `wallet` accounts and `fixed_deposit` assets: any
 *   tier, since actual accessibility genuinely varies by the account/deposit
 *   the user holds and only they can say which applies.
 */

const NEVER_CONFIGURABLE_ACCOUNT_TYPES = new Set<string>(["credit_card", "investment"]);
const NEVER_CONFIGURABLE_ASSET_KINDS = new Set<string>(["loan_liability", "loan_receivable"]);
const LOCKED_ONLY_ASSET_KINDS = new Set<string>(["gold", "silver"]);
const NO_INSTANT_ASSET_KINDS = new Set<string>(["investment"]);

const ALL_TIERS: readonly ReserveLiquidityTier[] = ["instant", "t_plus_1", "locked"];
const NON_INSTANT_TIERS: readonly ReserveLiquidityTier[] = ["t_plus_1", "locked"];
const LOCKED_ONLY_TIER: readonly ReserveLiquidityTier[] = ["locked"];

export function isConfigurableReserveSource(
  sourceKind: ReserveSourceKind,
  sourceType: ReserveSourceType
): boolean {
  if (sourceKind === "account") return !NEVER_CONFIGURABLE_ACCOUNT_TYPES.has(sourceType);
  return !NEVER_CONFIGURABLE_ASSET_KINDS.has(sourceType);
}

export function getAllowedLiquidityTiers(
  sourceKind: ReserveSourceKind,
  sourceType: ReserveSourceType
): readonly ReserveLiquidityTier[] {
  if (sourceKind === "account") return ALL_TIERS;
  if (LOCKED_ONLY_ASSET_KINDS.has(sourceType)) return LOCKED_ONLY_TIER;
  if (NO_INSTANT_ASSET_KINDS.has(sourceType)) return NON_INSTANT_TIERS;
  return ALL_TIERS;
}
