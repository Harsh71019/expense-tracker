"use client";

import type { ReactNode } from "react";

import { LIQUIDITY_TIER_DESCRIPTIONS, LIQUIDITY_TIER_LABELS } from "../model/reserve-presentation";

const TIER_ORDER = ["instant", "t_plus_1", "locked"] as const;

/**
 * Explains the three liquidity tiers in plain language. Used next to the
 * tier picker in the classification form and as a standalone reference in
 * the source manager.
 */
export function LiquidityTierHelp(): ReactNode {
  return (
    <div className="space-y-2.5 rounded-xl border border-border/60 bg-surface-muted/40 p-3.5">
      <h4 className="font-mono text-2xs font-extrabold tracking-[0.2em] text-foreground-muted uppercase">
        Liquidity tiers
      </h4>
      <dl className="space-y-2">
        {TIER_ORDER.map((tier) => (
          <div key={tier}>
            <dt className="text-xs font-semibold text-foreground">{LIQUIDITY_TIER_LABELS[tier]}</dt>
            <dd className="text-xs text-foreground-muted">{LIQUIDITY_TIER_DESCRIPTIONS[tier]}</dd>
          </div>
        ))}
      </dl>
      <p className="text-2xs text-foreground-muted">
        Locked sources stay visible for context but never count toward instant, T+1, or total
        eligible reserve — TreasuryOps does not calculate runway from them.
      </p>
    </div>
  );
}
