import type { DashboardInvestments } from "@treasury-ops/shared";
import type { ReactNode } from "react";

import { Money } from "@/components/ui/money";
import {
  ASSET_KIND_COLOR,
  ASSET_KIND_ICON,
  ASSET_KIND_SHORT_LABEL,
  Sparkline
} from "@/features/assets";

export function InvestmentsPanel({
  investments
}: Readonly<{ investments: DashboardInvestments }>): ReactNode {
  const total = investments.items.reduce((sum, item) => sum + item.currentValueMinor, 0);

  return (
    <div className="rounded-2xl border border-border bg-surface-elevated p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold tracking-tight text-foreground">
            Investments &amp; deposits
          </h2>
          <p className="mt-1 text-sm text-foreground-muted">
            Mutual funds, fixed deposits and long-term holdings
          </p>
        </div>
        <Money minor={total} size="lg" />
      </div>
      {investments.items.length === 0 ? (
        <p className="mt-6 text-sm text-foreground-muted">
          No investments or deposits tracked yet.
        </p>
      ) : (
        <div className="mt-5 grid gap-3.5 [grid-template-columns:repeat(auto-fill,minmax(230px,1fr))]">
          {investments.items.map((item) => {
            const color = ASSET_KIND_COLOR[item.kind];
            const values = item.series.map((point) => point.valueMinor);
            return (
              <div
                key={item.assetId}
                className="rounded-2xl border border-border bg-surface-muted p-4.5"
              >
                <div className="flex items-center gap-2.5">
                  <span
                    className="grid h-9 w-9 shrink-0 place-items-center rounded-[10px] text-lg"
                    style={{ background: `${color}26` }}
                  >
                    {ASSET_KIND_ICON[item.kind]}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-foreground">{item.name}</p>
                    <p className="mt-0.5 text-xs text-foreground-muted">
                      {ASSET_KIND_SHORT_LABEL[item.kind]}
                    </p>
                  </div>
                </div>
                <Money minor={item.currentValueMinor} size="lg" className="mt-3.5 mb-2 block" />
                {values.length > 1 ? (
                  <Sparkline values={values} color={color} width={200} height={44} />
                ) : null}
                <div className="mt-3 flex items-center justify-between">
                  {item.returnPct === null ? (
                    <span className="text-xs text-foreground-muted">—</span>
                  ) : (
                    <span className="font-mono text-[13px] font-semibold text-income">
                      {item.returnPct >= 0 ? "+" : ""}
                      {item.returnPct.toFixed(1)}%
                    </span>
                  )}
                  <span className="text-xs text-foreground-muted">total return</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
