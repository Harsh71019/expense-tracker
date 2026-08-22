"use client";

import type { Asset } from "@treasury-ops/shared";
import type { ReactNode } from "react";

import { SignedMoney } from "@/components/ui/money";
import { DialogSurface } from "@/components/ui/dialog";

import { useValuations } from "../hooks/use-valuations";
import { useAssetFundings } from "../hooks/use-asset-fundings";
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
  const fundings = useAssetFundings(asset.id);
  const items = valuations.data?.items ?? [];
  const color = ASSET_KIND_COLOR[asset.kind];
  const sparklineValues = items
    .slice()
    .reverse()
    .map((valuation) => valuation.valueMinor);

  return (
    <DialogSurface labelledBy="asset-history-title" onClose={onClose} variant="drawer">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="font-mono text-2xs font-semibold tracking-wider text-foreground-muted">
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
          aria-label="Close valuation history"
          className="grid h-11 w-11 shrink-0 place-items-center rounded-lg border border-border bg-surface-muted text-foreground-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          ✕
        </button>
      </div>

      <div className="mt-5.5 rounded-[14px] border border-border bg-surface-muted p-4.5">
        {valuations.isLoading ? (
          <p className="text-sm text-foreground-muted">Loading…</p>
        ) : (
          <Sparkline
            values={sparklineValues}
            color={color}
            width={400}
            height={120}
            className="h-auto w-full"
          />
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
                className={`h-2.5 w-2.5 shrink-0 rounded-full ${projected ? "bg-warning" : ""}`}
                aria-hidden="true"
              />
              <div className="flex-1">
                <SignedMoney minor={valuation.valueMinor} />
                <p className="mt-0.5 font-mono text-xs text-foreground-muted">
                  {dateFormatter.format(valuation.valuedAt)}
                </p>
              </div>
              <span
                className={`rounded-[5px] border px-2 py-1 font-mono text-2xs font-semibold tracking-wide ${
                  projected
                    ? "border-warning/30 bg-warning/10 text-warning"
                    : "border-border bg-surface text-foreground-muted"
                }`}
              >
                {projected ? "✦ Projected" : "Manual"}
              </span>
            </div>
          );
        })}
      </div>

      <section className="mt-6" aria-labelledby="asset-funding-history-title">
        <h3
          id="asset-funding-history-title"
          className="font-mono text-2xs font-semibold tracking-wider text-foreground-muted"
        >
          FUNDING ACTIVITY
        </h3>
        {fundings.isLoading ? (
          <p className="mt-3 text-sm text-foreground-muted">Loading funding activity…</p>
        ) : null}
        {fundings.isError ? (
          <p role="alert" className="mt-3 text-sm text-expense">
            Could not load funding activity.
          </p>
        ) : null}
        {fundings.data?.items.length === 0 ? (
          <p className="mt-3 text-sm text-foreground-muted">No funding activity yet.</p>
        ) : null}
        <div className="mt-2 flex flex-col gap-0.5">
          {(fundings.data?.items ?? []).map((funding) => (
            <div
              key={funding.id}
              className="flex items-center gap-3.5 border-b border-border py-3.5 last:border-b-0"
            >
              <span
                className={`h-2.5 w-2.5 shrink-0 rounded-full ${funding.status === "posted" ? "bg-income" : "bg-warning"}`}
                aria-hidden="true"
              />
              <div className="min-w-0 flex-1">
                <SignedMoney minor={funding.amountMinor} />
                <p className="mt-0.5 truncate font-mono text-xs text-foreground-muted">
                  {dateFormatter.format(funding.occurredAt)} · source{" "}
                  {funding.transactionId.slice(0, 8)}…
                </p>
              </div>
              <span className="rounded-[5px] border border-border bg-surface px-2 py-1 font-mono text-2xs font-semibold tracking-wide text-foreground-muted">
                {funding.status === "posted"
                  ? "Active"
                  : funding.status === "reversed"
                    ? "Reversed"
                    : "Reversal"}
              </span>
            </div>
          ))}
        </div>
      </section>
    </DialogSurface>
  );
}
