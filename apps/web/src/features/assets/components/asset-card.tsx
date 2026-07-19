"use client";

import type { Asset, NetWorthAsset } from "@vyaya/shared";
import type { CSSProperties, ReactNode } from "react";

import { SignedMoney } from "@/components/ui/money";
import { tint } from "@/features/categories";

import { useValuations } from "../hooks/use-valuations";
import { ASSET_KIND_COLOR, ASSET_KIND_ICON, ASSET_KIND_SHORT_LABEL } from "../model/asset-visuals";
import { Sparkline } from "./sparkline";

const dateFormatter = new Intl.DateTimeFormat("en-IN", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  timeZone: "Asia/Kolkata"
});

function subMeta(asset: Asset): string {
  if (asset.kind === "fixed_deposit") {
    const rate =
      asset.annualRateBps === undefined ? undefined : (asset.annualRateBps / 100).toFixed(2);
    const matures =
      asset.maturityAt === undefined ? undefined : dateFormatter.format(asset.maturityAt);
    if (rate !== undefined && matures !== undefined) return `${rate}% p.a. · matures ${matures}`;
    if (matures !== undefined) return `Matures ${matures}`;
  }
  if (asset.kind === "gold" || asset.kind === "silver") {
    if (asset.quantityMilliUnits !== undefined) {
      return `${(asset.quantityMilliUnits / 1000).toFixed(3)} g · opened ${dateFormatter.format(asset.openedAt)}`;
    }
  }
  return `Opened ${dateFormatter.format(asset.openedAt)}`;
}

type AssetCardProps = Readonly<{
  asset: Asset;
  netWorthEntry: NetWorthAsset | undefined;
  onAddValuation: (asset: Asset) => void;
  onHistory: (asset: Asset) => void;
  onClose: (asset: Asset) => void;
}>;

export function AssetCard({
  asset,
  netWorthEntry,
  onAddValuation,
  onHistory,
  onClose
}: AssetCardProps): ReactNode {
  const valuations = useValuations(asset.id);
  const items = valuations.data?.items ?? [];
  const latest = items[0];
  const color = ASSET_KIND_COLOR[asset.kind];

  const valueMinor = latest?.valueMinor ?? netWorthEntry?.valueMinor;
  const valuedAt = latest?.valuedAt ?? netWorthEntry?.valuedAt ?? undefined;
  const isProjected = latest?.source === "maturity_projection";
  const sparklineValues = items
    .slice()
    .reverse()
    .map((valuation) => valuation.valueMinor);

  const medallionStyle: CSSProperties = {
    background: tint(color, 0.14),
    border: `1px solid ${tint(color, 0.28)}`
  };
  const badgeStyle: CSSProperties = {
    color,
    background: tint(color, 0.14),
    border: `1px solid ${tint(color, 0.28)}`
  };

  return (
    <div className="rounded-[18px] border border-border bg-surface-elevated p-5.5 animate-fade-in">
      <div className="flex items-start gap-3.5">
        <div
          style={medallionStyle}
          className="grid h-12 w-12 shrink-0 place-items-center rounded-[13px] text-xl"
          aria-hidden="true"
        >
          {ASSET_KIND_ICON[asset.kind]}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="truncate text-[17px] font-bold tracking-tight text-foreground">
              {asset.name}
            </span>
            <span
              style={badgeStyle}
              className="rounded-[5px] px-1.5 py-0.5 font-mono text-[9px] font-semibold tracking-wide uppercase"
            >
              {ASSET_KIND_SHORT_LABEL[asset.kind]}
            </span>
          </div>
          <p className="mt-1 text-xs font-medium text-foreground-muted">{subMeta(asset)}</p>
        </div>
        <button
          type="button"
          onClick={() => onClose(asset)}
          title="Close asset"
          aria-label={`Close ${asset.name}`}
          className="grid h-7 w-7 shrink-0 place-items-center rounded-lg border border-border bg-surface-muted text-xs text-foreground-muted hover:text-foreground"
        >
          ✕
        </button>
      </div>

      <div className="mt-4.5 flex items-end justify-between gap-3.5">
        <div>
          <p className="font-mono text-[10px] font-semibold tracking-wider text-foreground-muted">
            CURRENT VALUE
          </p>
          {valueMinor === undefined ? (
            <p className="mt-0.5 text-sm text-foreground-muted">No valuation</p>
          ) : (
            <SignedMoney minor={valueMinor} size="lg" />
          )}
          <div className="mt-1.5 flex items-center gap-1.5 font-mono text-[11.5px] text-foreground-muted">
            {isProjected ? (
              <span className="rounded-[4px] border border-amber-500/30 bg-amber-500/10 px-1 py-0.5 font-mono text-[8.5px] font-semibold text-amber-500">
                ✦ PROJECTED
              </span>
            ) : null}
            {valuedAt === undefined ? null : dateFormatter.format(valuedAt)}
          </div>
        </div>
        <div className="shrink-0">
          <Sparkline values={sparklineValues} color={color} width={88} height={42} />
        </div>
      </div>

      <div className="mt-5 flex items-center gap-2 border-t border-border pt-4">
        <button
          type="button"
          onClick={() => onAddValuation(asset)}
          className="rounded-[9px] border border-border bg-accent-glow px-3.5 py-2 text-[12.5px] font-semibold text-accent"
        >
          + Add valuation
        </button>
        <button
          type="button"
          onClick={() => onHistory(asset)}
          className="rounded-[9px] px-1.5 py-2 text-[12.5px] font-medium text-foreground-muted"
        >
          {items.length} valuation{items.length === 1 ? "" : "s"}
        </button>
      </div>
    </div>
  );
}
