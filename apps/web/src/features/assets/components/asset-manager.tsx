"use client";

import type { Asset, AssetKind, NetWorth } from "@treasury-ops/shared";
import { useState } from "react";
import type { ReactNode } from "react";
import { toast } from "@/lib/toast";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { useNetWorth } from "@/features/net-worth/hooks/use-net-worth";

import { useCloseAsset } from "../hooks/use-asset-mutations";
import { useAssets } from "../hooks/use-assets";
import { ASSET_KIND_ORDER, ASSET_KIND_SHORT_LABEL } from "../model/asset-visuals";
import { AddValuationDialog } from "./add-valuation-dialog";
import { AssetCard } from "./asset-card";
import { AssetHistoryDrawer } from "./asset-history-drawer";
import { CloseAssetDialog } from "./close-asset-dialog";
import { CreateAssetDrawer } from "./create-asset-drawer";
import { NetWorthHero } from "./net-worth-hero";

type AssetManagerProps = Readonly<{
  initialAssets: Asset[];
  initialNetWorth: NetWorth | null;
}>;

export function AssetManager({ initialAssets, initialNetWorth }: AssetManagerProps): ReactNode {
  const assets = useAssets(initialAssets);
  const netWorth = useNetWorth(initialNetWorth ?? undefined);
  const closeAsset = useCloseAsset();

  const [filter, setFilter] = useState<AssetKind | "all">("all");
  const [createOpen, setCreateOpen] = useState(false);
  const [valuationTarget, setValuationTarget] = useState<Asset>();
  const [historyTarget, setHistoryTarget] = useState<Asset>();
  const [closeTarget, setCloseTarget] = useState<Asset>();

  const [searchQuery, setSearchQuery] = useState("");

  const open = (assets.data ?? initialAssets).filter((asset) => !asset.isClosed);
  const counts: Partial<Record<AssetKind, number>> = {};
  for (const asset of open) {
    counts[asset.kind] = (counts[asset.kind] ?? 0) + 1;
  }
  const visibleKinds = ASSET_KIND_ORDER.filter((kind) => (counts[kind] ?? 0) > 0);
  let shown = filter === "all" ? open : open.filter((asset) => asset.kind === filter);

  if (searchQuery.trim() !== "") {
    const q = searchQuery.toLowerCase().trim();
    shown = shown.filter((asset) => asset.name.toLowerCase().includes(q));
  }

  const isFiltered = searchQuery.trim() !== "" || filter !== "all";

  async function confirmClose(): Promise<void> {
    if (closeTarget === undefined) return;
    try {
      await closeAsset.mutateAsync(closeTarget.id);
      setCloseTarget(undefined);
      toast.success("Asset closed");
    } catch {
      toast.error("Could not close this asset");
    }
  }

  return (
    <section className="space-y-7">
      <header className="flex flex-col items-stretch gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="font-mono text-2xs font-bold tracking-[2px] text-accent">
            LEDGER · NET WORTH
          </p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            Assets &amp; net worth
          </h1>
          <p className="mt-2 max-w-xl text-sm leading-relaxed text-foreground-muted">
            Everything of value beyond your day-to-day accounts — loans, deposits, metals,
            investments — valued over time and rolled into one number.
          </p>
        </div>
        <Button type="button" className="w-full sm:w-auto" onClick={() => setCreateOpen(true)}>
          <span className="mr-1 text-base leading-none">+</span> New asset
        </Button>
      </header>

      {netWorth.data === undefined ? null : <NetWorthHero netWorth={netWorth.data} />}

      {open.length > 0 && (
        <div
          className={`mb-5 flex flex-wrap items-center gap-3.5 rounded-2xl border p-3.5 backdrop-blur transition-all duration-200 ${
            isFiltered
              ? "border-accent/40 bg-surface-elevated/90 shadow-sm"
              : "border-border/80 bg-surface-elevated/90"
          }`}
        >
          <div className="flex min-w-0 flex-1 basis-full items-center gap-2.5 rounded-xl border border-border/80 bg-surface-muted/60 px-3.5 transition-colors focus-within:border-accent/60 focus-within:bg-surface-muted focus-within:ring-2 focus-within:ring-accent/20 sm:min-w-56 sm:basis-auto">
            <span className="text-foreground-muted/70 text-sm font-semibold" aria-hidden="true">
              ⌕
            </span>
            <input
              value={searchQuery}
              name="assetSearch"
              autoComplete="off"
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search assets by name…"
              aria-label="Search assets"
              className="min-h-10 w-full bg-transparent py-2 text-base text-foreground outline-none placeholder:text-foreground-muted/60 sm:text-sm"
            />
            {searchQuery !== "" && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                aria-label="Clear search input"
                className="grid h-7 w-7 shrink-0 place-items-center rounded-lg text-xs text-foreground-muted hover:bg-surface-elevated hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              >
                ✕
              </button>
            )}
          </div>

          <div className="-mx-1 flex flex-1 items-center gap-1 overflow-x-auto px-1">
            <button
              type="button"
              aria-pressed={filter === "all"}
              onClick={() => setFilter("all")}
              className={`inline-flex min-h-10 shrink-0 items-center gap-2 rounded-xl border px-3.5 py-2 text-xs font-semibold transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                filter === "all"
                  ? "border-accent bg-accent-glow text-accent shadow-xs"
                  : "border-border/70 bg-surface-elevated/50 text-foreground-muted hover:border-accent/40 hover:text-foreground"
              }`}
            >
              All
              <span
                className={`rounded-[5px] px-1.5 py-0.5 font-mono text-2xs font-semibold ${
                  filter === "all" ? "text-accent" : "bg-surface-muted text-foreground-muted"
                }`}
              >
                {open.length}
              </span>
            </button>
            {visibleKinds.map((kind) => {
              const active = filter === kind;
              return (
                <button
                  key={kind}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setFilter(kind)}
                  className={`inline-flex min-h-10 shrink-0 items-center gap-2 rounded-xl border px-3.5 py-2 text-xs font-semibold transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                    active
                      ? "border-accent bg-accent-glow text-accent shadow-xs"
                      : "border-border/70 bg-surface-elevated/50 text-foreground-muted hover:border-accent/40 hover:text-foreground"
                  }`}
                >
                  {ASSET_KIND_SHORT_LABEL[kind]}
                  <span
                    className={`rounded-[5px] px-1.5 py-0.5 font-mono text-2xs font-semibold ${
                      active ? "text-accent" : "bg-surface-muted text-foreground-muted"
                    }`}
                  >
                    {counts[kind]}
                  </span>
                </button>
              );
            })}
          </div>

          {isFiltered && (
            <div className="flex w-full flex-wrap items-center gap-1.5 border-t border-border/60 pt-2.5">
              <span className="font-mono text-2xs font-semibold text-foreground-muted uppercase">
                Active:
              </span>
              {searchQuery !== "" && (
                <span className="inline-flex items-center gap-1 rounded-full border border-accent/30 bg-accent-glow px-2.5 py-0.5 font-mono text-xs font-medium text-accent">
                  <span>Search: &quot;{searchQuery}&quot;</span>
                  <button
                    type="button"
                    onClick={() => setSearchQuery("")}
                    className="hover:text-foreground focus-visible:outline-none"
                    aria-label="Remove search filter"
                  >
                    ×
                  </button>
                </span>
              )}
              {filter !== "all" && (
                <span className="inline-flex items-center gap-1 rounded-full border border-accent/30 bg-accent-glow px-2.5 py-0.5 font-mono text-xs font-medium text-accent">
                  <span>Kind: {ASSET_KIND_SHORT_LABEL[filter]}</span>
                  <button
                    type="button"
                    onClick={() => setFilter("all")}
                    className="hover:text-foreground focus-visible:outline-none"
                    aria-label="Remove kind filter"
                  >
                    ×
                  </button>
                </span>
              )}
            </div>
          )}
        </div>
      )}

      {shown.length === 0 ? (
        <EmptyState
          title="No active assets"
          description="Add an asset or liability to include it in net worth."
          action={
            <Button type="button" onClick={() => setCreateOpen(true)}>
              New asset
            </Button>
          }
        />
      ) : (
        <div className="grid gap-4.5 sm:grid-cols-2 lg:grid-cols-3">
          {shown.map((asset) => (
            <AssetCard
              key={asset.id}
              asset={asset}
              netWorthEntry={netWorth.data?.assets.find((entry) => entry.assetId === asset.id)}
              onAddValuation={setValuationTarget}
              onHistory={setHistoryTarget}
              onClose={setCloseTarget}
            />
          ))}
        </div>
      )}

      {createOpen ? <CreateAssetDrawer onClose={() => setCreateOpen(false)} /> : null}

      {valuationTarget === undefined ? null : (
        <AddValuationDialog asset={valuationTarget} onClose={() => setValuationTarget(undefined)} />
      )}

      {historyTarget === undefined ? null : (
        <AssetHistoryDrawer asset={historyTarget} onClose={() => setHistoryTarget(undefined)} />
      )}

      {closeTarget === undefined ? null : (
        <CloseAssetDialog
          asset={closeTarget}
          isPending={closeAsset.isPending}
          onCancel={() => setCloseTarget(undefined)}
          onConfirm={() => void confirmClose()}
        />
      )}
    </section>
  );
}
