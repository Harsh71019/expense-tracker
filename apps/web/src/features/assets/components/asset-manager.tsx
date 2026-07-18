"use client";

import type { Asset, AssetKind, NetWorth } from "@vyaya/shared";
import { useState } from "react";
import type { ReactNode } from "react";
import { toast } from "sonner";

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

  const open = (assets.data ?? initialAssets).filter((asset) => !asset.isClosed);
  const counts: Partial<Record<AssetKind, number>> = {};
  for (const asset of open) {
    counts[asset.kind] = (counts[asset.kind] ?? 0) + 1;
  }
  const visibleKinds = ASSET_KIND_ORDER.filter((kind) => (counts[kind] ?? 0) > 0);
  const shown = filter === "all" ? open : open.filter((asset) => asset.kind === filter);

  async function confirmClose(): Promise<void> {
    if (closeTarget === undefined) return;
    try {
      await closeAsset.mutateAsync(closeTarget.id);
      setCloseTarget(undefined);
    } catch {
      toast.error("Could not close this asset");
    }
  }

  return (
    <section className="space-y-7">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="font-mono text-[11px] font-bold tracking-[2px] text-accent">
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
        <Button type="button" onClick={() => setCreateOpen(true)}>
          <span className="mr-1 text-base leading-none">+</span> New asset
        </Button>
      </header>

      {netWorth.data === undefined ? null : <NetWorthHero netWorth={netWorth.data} />}

      <div className="flex flex-wrap items-center gap-1">
        <button
          type="button"
          aria-pressed={filter === "all"}
          onClick={() => setFilter("all")}
          className={`inline-flex items-center gap-2 rounded-lg border px-3.5 py-2 text-sm font-semibold transition-colors duration-150 ${
            filter === "all"
              ? "border-accent bg-accent-glow text-accent"
              : "border-transparent text-foreground-muted hover:bg-surface-muted/60"
          }`}
        >
          All
          <span
            className={`rounded-[5px] px-1.5 py-0.5 font-mono text-[11px] font-semibold ${
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
              className={`inline-flex items-center gap-2 rounded-lg border px-3.5 py-2 text-sm font-semibold transition-colors duration-150 ${
                active
                  ? "border-accent bg-accent-glow text-accent"
                  : "border-transparent text-foreground-muted hover:bg-surface-muted/60"
              }`}
            >
              {ASSET_KIND_SHORT_LABEL[kind]}
              <span
                className={`rounded-[5px] px-1.5 py-0.5 font-mono text-[11px] font-semibold ${
                  active ? "text-accent" : "bg-surface-muted text-foreground-muted"
                }`}
              >
                {counts[kind]}
              </span>
            </button>
          );
        })}
      </div>

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
