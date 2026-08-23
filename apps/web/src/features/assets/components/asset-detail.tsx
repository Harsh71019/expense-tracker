"use client";

import {
  calculateMarketValueMinor,
  formatMicroUnits,
  formatMinor,
  formatPricePerUnit,
  type Asset,
  type MarketRates,
  type MetalRate,
  type ValuationPage
} from "@treasury-ops/shared";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import {
  ArrowDownRight,
  ArrowUpRight,
  Calculator,
  CheckCircle2,
  History,
  Plus,
  RefreshCw,
  TrendingUp,
  XCircle
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { Button } from "@/components/ui/button";
import { SignedMoney } from "@/components/ui/money";
import { tint } from "@/features/categories";
import { toast } from "@/lib/toast";

import { useAsset } from "../hooks/use-asset";
import {
  useAssetMarketValuation,
  useRefreshMarketQuote
} from "../hooks/use-asset-market-valuation";
import { useCloseAsset, useCreateValuation } from "../hooks/use-asset-mutations";
import { useMarketRates } from "../hooks/use-market-rates";
import { useValuations } from "../hooks/use-valuations";
import {
  ASSET_KIND_COLOR,
  ASSET_KIND_FULL_LABEL,
  ASSET_KIND_ICON,
  ASSET_KIND_SHORT_LABEL
} from "../model/asset-visuals";
import { AddValuationDialog } from "./add-valuation-dialog";
import { CloseAssetDialog } from "./close-asset-dialog";
import { DisposalEstimateModal } from "./disposal-estimate-modal";

const dateFormatter = new Intl.DateTimeFormat("en-IN", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  timeZone: "Asia/Kolkata"
});

const timeFormatter = new Intl.DateTimeFormat("en-IN", {
  hour: "2-digit",
  minute: "2-digit",
  hour12: true,
  timeZone: "Asia/Kolkata"
});

type AssetDetailProps = Readonly<{
  initialAsset: Asset;
  initialValuations: ValuationPage;
  initialMarketRates: MarketRates | null;
}>;

export function AssetDetail({
  initialAsset,
  initialValuations,
  initialMarketRates
}: AssetDetailProps): ReactNode {
  const router = useRouter();
  const gradientId = useId();
  const assetQuery = useAsset(initialAsset.id, initialAsset);
  const asset = assetQuery.data ?? initialAsset;

  const valuationsQuery = useValuations(asset.id, initialValuations);
  const valuationItems = valuationsQuery.data?.items ?? initialValuations.items;

  const marketRatesQuery = useMarketRates(initialMarketRates);
  const marketRates = marketRatesQuery.data ?? initialMarketRates;

  const createValuation = useCreateValuation();
  const closeAssetMutation = useCloseAsset();

  const [addValuationOpen, setAddValuationOpen] = useState(false);
  const [closeAssetOpen, setCloseAssetOpen] = useState(false);
  const [disposalOpen, setDisposalOpen] = useState(false);

  const marketValuationQuery = useAssetMarketValuation(asset.id);
  const marketValuation = marketValuationQuery.data;
  const refreshQuoteMutation = useRefreshMarketQuote();

  const color = ASSET_KIND_COLOR[asset.kind];
  const latest = valuationItems[0];
  const initial = valuationItems[valuationItems.length - 1];

  const currentValueMinor = latest?.valueMinor ?? 0;
  const initialValueMinor = initial?.valueMinor ?? 0;
  const netGainMinor = currentValueMinor - initialValueMinor;
  const netGainPct =
    initialValueMinor !== 0
      ? ((netGainMinor / Math.abs(initialValueMinor)) * 100).toFixed(2)
      : undefined;

  // Gold / Silver specific logic
  const isPreciousMetal = asset.kind === "gold" || asset.kind === "silver";
  const quantityGrams =
    asset.quantityMilliUnits !== undefined ? asset.quantityMilliUnits / 1000 : undefined;
  const metalRate =
    asset.kind === "gold"
      ? marketRates?.gold
      : asset.kind === "silver"
        ? marketRates?.silver
        : undefined;

  const liveMarketValueMinor = calculateLegacyMetalMarketValue(asset.quantityMilliUnits, metalRate);

  const marketDiffMinor =
    liveMarketValueMinor !== undefined ? liveMarketValueMinor - currentValueMinor : undefined;

  async function handleSyncToMarket(): Promise<void> {
    if (liveMarketValueMinor === undefined) return;
    try {
      await createValuation.mutateAsync({
        assetId: asset.id,
        body: {
          valueMinor: liveMarketValueMinor,
          valuedAt: new Date(),
          source: "manual"
        }
      });
      toast.success("Valuation synced to indicative spot reference");
    } catch {
      toast.error("Could not sync valuation");
    }
  }

  async function handleConfirmClose(): Promise<void> {
    try {
      await closeAssetMutation.mutateAsync(asset.id);
      toast.success(`${asset.name} closed`);
      router.push("/assets");
    } catch {
      toast.error("Could not close asset");
    }
  }

  const medallionStyle: CSSProperties = {
    background: tint(color, 0.14),
    border: `1px solid ${tint(color, 0.28)}`,
    boxShadow: `0 0 24px ${tint(color, 0.12)}`
  };

  const badgeStyle: CSSProperties = {
    color,
    background: tint(color, 0.14),
    border: `1px solid ${tint(color, 0.28)}`
  };

  // Sparkline/Chart points calculation
  const chronologicalValues = valuationItems
    .slice()
    .reverse()
    .map((v) => ({
      date: new Date(v.valuedAt),
      val: v.valueMinor
    }));

  return (
    <div className="space-y-7 animate-fade-in pb-12">
      {/* Navigation Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Breadcrumbs items={[{ label: "Assets", href: "/assets" }, { label: asset.name }]} />
        <Link
          href="/assets"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-foreground-muted hover:text-foreground transition-colors"
        >
          ← Back to all assets
        </Link>
      </div>

      {/* Hero Header Card */}
      <header className="rounded-3xl border border-border bg-surface-elevated p-6 sm:p-8 shadow-sm backdrop-blur">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-4 sm:items-center sm:gap-5">
            <div
              style={medallionStyle}
              className="grid h-16 w-16 shrink-0 place-items-center rounded-2xl text-3xl transition-transform hover:scale-105"
              aria-hidden="true"
            >
              {ASSET_KIND_ICON[asset.kind]}
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2.5">
                <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
                  {asset.name}
                </h1>
                <span
                  style={badgeStyle}
                  className="rounded-md px-2 py-0.5 font-mono text-2xs font-bold tracking-wider uppercase"
                >
                  {ASSET_KIND_SHORT_LABEL[asset.kind]}
                </span>
                {asset.isClosed ? (
                  <span className="inline-flex items-center gap-1 rounded-md border border-foreground-muted/30 bg-surface-muted px-2 py-0.5 font-mono text-2xs font-semibold text-foreground-muted uppercase">
                    <XCircle size={12} /> Closed
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 rounded-md border border-income/30 bg-income/10 px-2 py-0.5 font-mono text-2xs font-semibold text-income uppercase">
                    <CheckCircle2 size={12} /> Active
                  </span>
                )}
              </div>
              <p className="mt-1 text-sm font-medium text-foreground-muted">
                {ASSET_KIND_FULL_LABEL[asset.kind]} · Opened on{" "}
                {dateFormatter.format(asset.openedAt)}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {!asset.isClosed ? (
              <>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setDisposalOpen(true)}
                  className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold border border-border/80"
                >
                  <Calculator size={14} /> Estimate Disposal / Tax
                </Button>
                <Button
                  type="button"
                  variant="primary"
                  onClick={() => setAddValuationOpen(true)}
                  className="flex items-center gap-2 px-4 py-2.5 font-semibold"
                >
                  <Plus size={16} /> Record valuation
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setCloseAssetOpen(true)}
                  className="border border-border/80 text-xs text-foreground-muted hover:text-expense hover:border-expense/30 transition-colors"
                >
                  Close asset
                </Button>
              </>
            ) : null}
          </div>
        </div>
      </header>

      {/* Metrics Deck */}
      <section
        aria-label="Asset Key Metrics"
        className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4"
      >
        {/* Metric 1: Current Valuation */}
        <div className="rounded-2xl border border-border bg-surface-elevated p-5 shadow-sm">
          <p className="font-mono text-2xs font-bold tracking-wider text-foreground-muted uppercase">
            Current Valuation
          </p>
          <div className="mt-2 flex items-baseline gap-2">
            <SignedMoney minor={currentValueMinor} size="lg" />
          </div>
          <p className="mt-1.5 font-mono text-2xs text-foreground-muted">
            {latest
              ? `As of ${dateFormatter.format(new Date(latest.valuedAt))}`
              : "No valuations yet"}
          </p>
        </div>

        {/* Metric 2: Net Growth / ROI */}
        <div className="rounded-2xl border border-border bg-surface-elevated p-5 shadow-sm">
          <p className="font-mono text-2xs font-bold tracking-wider text-foreground-muted uppercase">
            All-Time Growth
          </p>
          <div className="mt-2 flex items-baseline gap-2">
            <SignedMoney minor={netGainMinor} size="lg" />
            {netGainPct !== undefined ? (
              <span
                className={`inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 font-mono text-2xs font-bold ${
                  netGainMinor >= 0
                    ? "bg-income/10 text-income border border-income/20"
                    : "bg-expense/10 text-expense border border-expense/20"
                }`}
              >
                {netGainMinor >= 0 ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
                {netGainPct}%
              </span>
            ) : null}
          </div>
          <p className="mt-1.5 font-mono text-2xs text-foreground-muted">
            Initial: <SignedMoney minor={initialValueMinor} size="sm" />
          </p>
        </div>

        {/* Metric 3: Specific Asset Meta */}
        {asset.kind === "fixed_deposit" ? (
          <div className="rounded-2xl border border-border bg-surface-elevated p-5 shadow-sm">
            <p className="font-mono text-2xs font-bold tracking-wider text-foreground-muted uppercase">
              Interest & Maturity
            </p>
            <div className="mt-2 flex items-baseline gap-1.5">
              <span className="text-xl font-bold tracking-tight text-foreground">
                {asset.annualRateBps !== undefined
                  ? `${(asset.annualRateBps / 100).toFixed(2)}%`
                  : "—"}
              </span>
              <span className="font-mono text-2xs text-foreground-muted">p.a.</span>
            </div>
            <p className="mt-1.5 font-mono text-2xs text-foreground-muted">
              {asset.maturityAt
                ? `Matures ${dateFormatter.format(asset.maturityAt)}`
                : "No maturity set"}
            </p>
          </div>
        ) : isPreciousMetal ? (
          <div className="rounded-2xl border border-border bg-surface-elevated p-5 shadow-sm">
            <p className="font-mono text-2xs font-bold tracking-wider text-foreground-muted uppercase">
              Holdings Weight
            </p>
            <div className="mt-2 flex items-baseline gap-1.5">
              <span className="text-xl font-bold tracking-tight text-foreground">
                {quantityGrams !== undefined ? quantityGrams.toFixed(3) : "—"}
              </span>
              <span className="font-mono text-2xs text-foreground-muted">grams</span>
            </div>
            <p className="mt-1.5 font-mono text-2xs text-foreground-muted">
              {asset.kind === "gold" ? "24 Karat Bullion / SGB" : "Silver Bullion"}
            </p>
          </div>
        ) : (
          <div className="rounded-2xl border border-border bg-surface-elevated p-5 shadow-sm">
            <p className="font-mono text-2xs font-bold tracking-wider text-foreground-muted uppercase">
              Inception Date
            </p>
            <div className="mt-2 flex items-baseline gap-1.5">
              <span className="text-lg font-bold tracking-tight text-foreground">
                {dateFormatter.format(asset.openedAt)}
              </span>
            </div>
            <p className="mt-1.5 font-mono text-2xs text-foreground-muted">
              Recorded in personal ledger
            </p>
          </div>
        )}

        {/* Metric 4: Valuation Points Count */}
        <div className="rounded-2xl border border-border bg-surface-elevated p-5 shadow-sm">
          <p className="font-mono text-2xs font-bold tracking-wider text-foreground-muted uppercase">
            History Snapshots
          </p>
          <div className="mt-2 flex items-baseline gap-1.5">
            <span className="text-xl font-bold tracking-tight text-foreground">
              {valuationItems.length}
            </span>
            <span className="font-mono text-2xs text-foreground-muted">
              record{valuationItems.length === 1 ? "" : "s"}
            </span>
          </div>
          <p className="mt-1.5 font-mono text-2xs text-foreground-muted">
            Append-only valuation timeline
          </p>
        </div>
      </section>

      {/* Live Market Price & Sync Banner for Gold & Silver */}
      {isPreciousMetal && metalRate !== undefined ? (
        <section
          aria-label="Live Market Rate & Sync"
          className="relative overflow-hidden rounded-3xl border border-accent/40 bg-gradient-to-r from-surface-elevated via-accent/5 to-surface-elevated p-6 shadow-sm"
        >
          <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <span
                  className={`flex h-2.5 w-2.5 rounded-full ${
                    marketRates?.isStale ? "bg-expense" : "bg-income animate-pulse"
                  }`}
                />
                <p className="font-mono text-2xs font-bold tracking-widest text-accent uppercase">
                  INDICATIVE SPOT REFERENCE (GOLD API · INR)
                </p>
              </div>
              <h2 className="text-xl font-bold tracking-tight text-foreground sm:text-2xl">
                Current {asset.kind === "gold" ? "Gold" : "Silver"} Spot Rate:{" "}
                <span className="text-accent">{metalRate.priceFormatted}</span>
              </h2>
              <p className="text-xs text-foreground-muted">
                Gold API global spot reference · Provider quote at{" "}
                {timeFormatter.format(new Date(metalRate.providerAsOf))}
                {marketRates?.isStale ? " · Stale — awaiting refresh" : ""}
              </p>
            </div>

            {quantityGrams !== undefined && liveMarketValueMinor !== undefined ? (
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center rounded-2xl border border-border/80 bg-surface-elevated/80 p-4 backdrop-blur">
                <div>
                  <p className="font-mono text-2xs font-semibold text-foreground-muted uppercase">
                    Computed Holdings Value ({quantityGrams.toFixed(3)}g)
                  </p>
                  <div className="mt-1 flex items-baseline gap-2">
                    <SignedMoney minor={liveMarketValueMinor} size="lg" />
                    {marketDiffMinor !== undefined && marketDiffMinor !== 0 ? (
                      <span
                        className={`font-mono text-2xs font-bold ${
                          marketDiffMinor > 0 ? "text-income" : "text-expense"
                        }`}
                      >
                        ({marketDiffMinor > 0 ? "+" : ""}
                        <SignedMoney minor={marketDiffMinor} size="sm" /> vs book)
                      </span>
                    ) : null}
                  </div>
                </div>

                {!asset.isClosed ? (
                  <Button
                    type="button"
                    onClick={handleSyncToMarket}
                    disabled={createValuation.isPending}
                    className="flex shrink-0 items-center justify-center gap-2 px-4 py-2.5 text-xs font-semibold shadow-sm"
                  >
                    <RefreshCw
                      size={14}
                      className={createValuation.isPending ? "animate-spin" : ""}
                    />
                    {createValuation.isPending ? "Syncing…" : "Sync indicative rate"}
                  </Button>
                ) : null}
              </div>
            ) : null}
          </div>
        </section>
      ) : null}

      {/* Market-Linked Valuation Section */}
      {marketValuation !== undefined &&
        (marketValuation.quote !== null || marketValuation.position.quantityMicroUnits > 0) && (
          <section
            aria-label="Market Valuation Details"
            className="rounded-3xl border border-border bg-surface-elevated p-6 shadow-sm space-y-4"
          >
            <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-border">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-base font-bold text-foreground">Market-Linked Valuation</h2>
                  {marketValuation.quote && (
                    <Badge
                      variant={
                        marketValuation.quote.freshness === "fresh"
                          ? "success"
                          : marketValuation.quote.freshness === "delayed"
                            ? "pending"
                            : marketValuation.quote.freshness === "stale"
                              ? "problem"
                              : "info"
                      }
                    >
                      Quote: {marketValuation.quote.freshness}
                    </Badge>
                  )}
                  {marketValuation.lastReconciledAt && (
                    <Badge variant="accent">
                      Reconciled from CAS (
                      {dateFormatter.format(new Date(marketValuation.lastReconciledAt))})
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-foreground-muted mt-0.5">
                  Live AMFI NAV / Spot pricing linked to {asset.name}
                </p>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  disabled={refreshQuoteMutation.isPending}
                  onClick={async () => {
                    try {
                      await refreshQuoteMutation.mutateAsync(asset.id);
                      toast.success("Market quote refreshed");
                    } catch {
                      toast.error("Failed to refresh market quote");
                    }
                  }}
                >
                  <RefreshCw
                    size={12}
                    className={`mr-1.5 ${refreshQuoteMutation.isPending ? "animate-spin" : ""}`}
                  />
                  Refresh Quote
                </Button>
                <Button
                  type="button"
                  variant="primary"
                  size="sm"
                  onClick={() => setDisposalOpen(true)}
                >
                  <Calculator size={12} className="mr-1.5" /> Estimate Tax
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="rounded-xl border border-border bg-surface-muted/40 p-3.5">
                <p className="text-[11px] text-foreground-muted">Units / Holdings</p>
                <p className="text-lg font-bold font-mono text-foreground mt-0.5">
                  {formatMicroUnits(marketValuation.position.quantityMicroUnits)} units
                </p>
                <p className="text-[10px] text-foreground-muted mt-0.5">
                  {marketValuation.position.eventCount} ledger position events
                </p>
              </div>

              <div className="rounded-xl border border-border bg-surface-muted/40 p-3.5">
                <p className="text-[11px] text-foreground-muted">Live NAV / Price</p>
                <p className="text-lg font-bold font-mono text-foreground mt-0.5">
                  {marketValuation.quote
                    ? `₹${formatPricePerUnit(marketValuation.quote.priceMicroRupeesPerQuoteUnit)}`
                    : "Unavailable"}
                </p>
                {marketValuation.quote && (
                  <p className="text-[10px] text-foreground-muted mt-0.5">
                    As of {dateFormatter.format(new Date(marketValuation.quote.providerAsOf))}
                  </p>
                )}
              </div>

              <div className="rounded-xl border border-border bg-surface-muted/40 p-3.5">
                <p className="text-[11px] text-foreground-muted">Estimated Market Value</p>
                <p className="text-lg font-bold font-mono text-accent mt-0.5">
                  {marketValuation.estimatedValueMinor !== null
                    ? `₹${formatMinor(marketValuation.estimatedValueMinor)}`
                    : "—"}
                </p>
                {marketValuation.estimatedValueMinor !== null && latest !== undefined && (
                  <p
                    className={`text-[10px] font-mono mt-0.5 font-semibold ${
                      marketValuation.estimatedValueMinor - latest.valueMinor >= 0
                        ? "text-emerald-500"
                        : "text-rose-500"
                    }`}
                  >
                    {marketValuation.estimatedValueMinor - latest.valueMinor >= 0 ? "+" : ""}₹
                    {formatMinor(marketValuation.estimatedValueMinor - latest.valueMinor)} vs book
                  </p>
                )}
              </div>
            </div>
          </section>
        )}

      {/* Trajectory Growth Chart Card */}
      {chronologicalValues.length > 1 ? (
        <section
          aria-label="Valuation Growth Chart"
          className="rounded-3xl border border-border bg-surface-elevated p-6 shadow-sm"
        >
          <div className="flex items-center justify-between pb-4 border-b border-border/60">
            <div>
              <h2 className="text-base font-bold text-foreground flex items-center gap-2">
                <TrendingUp size={18} className="text-accent" /> Valuation Trajectory
              </h2>
              <p className="mt-0.5 text-xs text-foreground-muted">
                Wealth trajectory recorded over {valuationItems.length} valuation checkpoints
              </p>
            </div>
          </div>

          <div className="mt-6 w-full h-48 sm:h-64">
            <svg
              viewBox="0 0 800 240"
              preserveAspectRatio="none"
              className="w-full h-full overflow-visible"
            >
              <defs>
                <linearGradient id={`grad-${gradientId}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={color} stopOpacity="0.35" />
                  <stop offset="100%" stopColor={color} stopOpacity="0.0" />
                </linearGradient>
              </defs>

              {(() => {
                const vals = chronologicalValues.map((d) => d.val);
                const min = Math.min(...vals);
                const max = Math.max(...vals);
                const range = max === min ? 1 : max - min;
                const padding = 20;
                const width = 800;
                const height = 240;

                const points = chronologicalValues.map((d, i) => {
                  const x =
                    (i / (chronologicalValues.length - 1)) * (width - 2 * padding) + padding;
                  const y = height - padding - ((d.val - min) / range) * (height - 2 * padding);
                  return { x, y, val: d.val, date: d.date };
                });

                const linePath = points
                  .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`)
                  .join(" ");
                const areaPath = `${linePath} L ${points[points.length - 1]?.x ?? 0} ${height} L ${points[0]?.x ?? 0} ${height} Z`;

                return (
                  <>
                    <path d={areaPath} fill={`url(#grad-${gradientId})`} />
                    <path
                      d={linePath}
                      fill="none"
                      stroke={color}
                      strokeWidth="3.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                    {points.map((p, i) => (
                      <circle
                        key={i}
                        cx={p.x}
                        cy={p.y}
                        r="5"
                        fill={color}
                        className="stroke-surface-elevated stroke-2 hover:r-7 transition-all duration-150"
                      />
                    ))}
                  </>
                );
              })()}
            </svg>
          </div>
        </section>
      ) : null}

      {/* Valuation History Timeline Table */}
      <section
        aria-label="Valuation History Log"
        className="rounded-3xl border border-border bg-surface-elevated p-6 shadow-sm"
      >
        <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-border/60">
          <div>
            <h2 className="text-base font-bold text-foreground flex items-center gap-2">
              <History size={18} className="text-accent" /> Valuation History
            </h2>
            <p className="mt-0.5 text-xs text-foreground-muted">
              Immutable checkpoints stored in the ledger
            </p>
          </div>
          {!asset.isClosed ? (
            <Button
              type="button"
              variant="secondary"
              onClick={() => setAddValuationOpen(true)}
              className="text-xs font-semibold"
            >
              + Add valuation
            </Button>
          ) : null}
        </div>

        {valuationItems.length === 0 ? (
          <div className="py-12 text-center">
            <p className="text-sm font-medium text-foreground-muted">No valuations recorded yet.</p>
          </div>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-border/50 text-2xs font-mono font-bold tracking-wider text-foreground-muted uppercase">
                  <th className="py-3 px-3">Date</th>
                  <th className="py-3 px-3">Valuation</th>
                  <th className="py-3 px-3">Change</th>
                  <th className="py-3 px-3">Type / Source</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40 font-mono">
                {valuationItems.map((valItem, idx) => {
                  const nextOlder = valuationItems[idx + 1];
                  const deltaMinor =
                    nextOlder !== undefined ? valItem.valueMinor - nextOlder.valueMinor : undefined;

                  return (
                    <tr
                      key={valItem.id}
                      className="hover:bg-surface-muted/50 transition-colors duration-150"
                    >
                      <td className="py-3.5 px-3 text-xs text-foreground font-sans font-medium">
                        {dateFormatter.format(new Date(valItem.valuedAt))}
                      </td>
                      <td className="py-3.5 px-3 text-sm font-bold text-foreground">
                        <SignedMoney minor={valItem.valueMinor} size="sm" />
                      </td>
                      <td className="py-3.5 px-3 text-xs">
                        {deltaMinor === undefined ? (
                          <span className="text-foreground-muted">— (Opening)</span>
                        ) : deltaMinor === 0 ? (
                          <span className="text-foreground-muted">0.00</span>
                        ) : (
                          <span
                            className={`font-semibold ${
                              deltaMinor > 0 ? "text-income" : "text-expense"
                            }`}
                          >
                            {deltaMinor > 0 ? "+" : ""}
                            <SignedMoney minor={deltaMinor} size="sm" />
                          </span>
                        )}
                      </td>
                      <td className="py-3.5 px-3 text-xs">
                        {valItem.source === "maturity_projection" ? (
                          <span className="rounded-md border border-warning/30 bg-warning/10 px-2 py-0.5 font-mono text-2xs font-semibold text-warning">
                            ✦ PROJECTED
                          </span>
                        ) : (
                          <span className="rounded-md border border-border/80 bg-surface-muted px-2 py-0.5 font-mono text-2xs font-medium text-foreground-muted">
                            MANUAL ENTRY
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Dialogs */}
      {addValuationOpen ? (
        <AddValuationDialog asset={asset} onClose={() => setAddValuationOpen(false)} />
      ) : null}

      {closeAssetOpen ? (
        <CloseAssetDialog
          asset={asset}
          isPending={closeAssetMutation.isPending}
          onCancel={() => setCloseAssetOpen(false)}
          onConfirm={handleConfirmClose}
        />
      ) : null}

      <DisposalEstimateModal
        asset={asset}
        valuationDetails={marketValuation}
        open={disposalOpen}
        onOpenChange={setDisposalOpen}
      />
    </div>
  );
}

function calculateLegacyMetalMarketValue(
  quantityMilliUnits: number | undefined,
  metalRate: MetalRate | undefined
): number | undefined {
  if (
    quantityMilliUnits === undefined ||
    !Number.isSafeInteger(quantityMilliUnits) ||
    quantityMilliUnits < 1 ||
    quantityMilliUnits > Math.floor(Number.MAX_SAFE_INTEGER / 1_000) ||
    metalRate === undefined
  ) {
    return undefined;
  }

  return calculateMarketValueMinor(quantityMilliUnits * 1_000, metalRate.priceMicroRupeesPerGram);
}
