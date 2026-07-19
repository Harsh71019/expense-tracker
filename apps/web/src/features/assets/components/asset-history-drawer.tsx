"use client";

import type { Asset } from "@vyaya/shared";
import type { ReactNode } from "react";

import { SignedMoney } from "@/components/ui/money";

import { useValuations } from "../hooks/use-valuations";
import { ASSET_KIND_COLOR } from "../model/asset-visuals";
import { Sparkline } from "./sparkline";

const dateFormatter = new Intl.DateTimeFormat("en-IN", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  timeZone: "Asia/Kolkata"
});

type AssetHistoryDrawerProps = Readonly<{ asset: Asset; onClose: () => void }>;

export function AssetHistoryDrawer({ asset, onClose }: AssetHistoryDrawerProps): ReactNode {
  const valuations = useValuations(asset.id);
  const items = valuations.data?.items ?? [];
  const color = ASSET_KIND_COLOR[asset.kind];
  const sparklineValues = items
    .slice()
    .reverse()
    .map((valuation) => valuation.valueMinor);

  return (
    <div
      role="presentation"
      className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-sm animate-fade-in"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="asset-history-title"
        className="h-screen w-full max-w-md overflow-y-auto border-l border-border bg-surface-elevated p-7 animate-drawer-in"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="font-mono text-[11px] font-semibold tracking-wider text-foreground-muted">
              VALUATION HISTORY
            </p>
            <h2
              id="asset-history-title"
              className="mt-1 text-[22px] font-bold tracking-tight text-foreground"
            >
              {asset.name}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="grid h-8.5 w-8.5 shrink-0 place-items-center rounded-lg border border-border bg-surface-muted text-foreground-muted hover:text-foreground"
          >
            ✕
          </button>
        </div>

        <div className="mt-5.5 rounded-[14px] border border-border bg-surface-muted p-4.5">
          {valuations.isLoading ? (
            <p className="text-sm text-foreground-muted">Loading…</p>
          ) : (
            <Sparkline values={sparklineValues} color={color} width={400} height={120} />
          )}
        </div>

        <div className="mt-5.5 flex flex-col gap-0.5">
          {items.map((valuation) => {
            const projected = valuation.source === "maturity_projection";
            return (
              <div
                key={valuation.id}
                className="flex items-center gap-3.5 border-b border-border py-3.5 last:border-b-0"
              >
                <span
                  style={{ background: projected ? undefined : color }}
                  className={`h-2.5 w-2.5 shrink-0 rounded-full ${projected ? "bg-amber-500" : ""}`}
                  aria-hidden="true"
                />
                <div className="flex-1">
                  <SignedMoney minor={valuation.valueMinor} />
                  <p className="mt-0.5 font-mono text-xs text-foreground-muted">
                    {dateFormatter.format(valuation.valuedAt)}
                  </p>
                </div>
                <span
                  className={`rounded-[5px] border px-2 py-1 font-mono text-[10px] font-semibold tracking-wide ${
                    projected
                      ? "border-amber-500/30 bg-amber-500/10 text-amber-500"
                      : "border-border bg-surface text-foreground-muted"
                  }`}
                >
                  {projected ? "✦ Projected" : "Manual"}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
