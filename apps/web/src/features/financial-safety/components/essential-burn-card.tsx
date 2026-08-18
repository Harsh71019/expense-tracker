"use client";

import { formatMinor, type EssentialBurnResponse } from "@treasury-ops/shared";
import { AlertCircle, ArrowRight, Flame, Layers } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import type { ReactNode } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { usePrivacy } from "@/lib/privacy/privacy-context";
import { useEssentialBurn } from "../hooks/use-essential-burn";
import {
  getObservedMonthsWording,
  getQualityBadgeConfig,
  hasClassificationLimitations
} from "../model/burn-presentation";
import { BurnBreakdownDrawer } from "./burn-breakdown-drawer";

export interface EssentialBurnCardProps {
  readonly initialData: EssentialBurnResponse | null;
  readonly className?: string;
}

export function EssentialBurnCard({
  initialData,
  className = ""
}: EssentialBurnCardProps): ReactNode {
  const { data, error, refetch, isFetching } = useEssentialBurn(initialData);
  const { privacyMode } = usePrivacy();
  const [drawerOpen, setDrawerOpen] = useState(false);

  if (error && !data) {
    return (
      <div
        className={[
          "rounded-2xl border border-border/80 bg-surface p-5 shadow-sm transition-all",
          className
        ]
          .filter(Boolean)
          .join(" ")}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-problem/10 text-problem">
              <Flame className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-foreground">Essential Monthly Burn</h3>
              <p className="text-xs text-problem">Failed to load essential burn baseline.</p>
            </div>
          </div>
          <Button
            variant="secondary"
            className="text-xs"
            disabled={isFetching}
            onClick={() => void refetch()}
          >
            {isFetching ? "Retrying…" : "Retry"}
          </Button>
        </div>
      </div>
    );
  }

  if (!data) return null;

  const badgeConfig = getQualityBadgeConfig(data.quality);
  const hasClassificationIssues = hasClassificationLimitations(data.limitations);
  const displayValue =
    data.averageMonthlyEssentialMinor !== null
      ? privacyMode
        ? "₹ ••••••"
        : formatMinor(data.averageMonthlyEssentialMinor)
      : "—";

  return (
    <>
      <div
        className={[
          "rounded-2xl border border-border/80 bg-surface p-5 shadow-sm transition-all",
          className
        ]
          .filter(Boolean)
          .join(" ")}
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent/10 text-accent">
              <Flame className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-foreground">Essential Monthly Burn</h3>
                <Badge variant={badgeConfig.variant}>{badgeConfig.label}</Badge>
              </div>
              <p className="text-xs text-foreground-muted">
                {getObservedMonthsWording(data.observedCompleteMonthCount)}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="secondary"
              className="inline-flex items-center gap-1.5 text-xs font-semibold"
              onClick={() => setDrawerOpen(true)}
            >
              <Layers className="h-3.5 w-3.5" />
              <span>View Breakdown</span>
            </Button>
          </div>
        </div>

        {/* Primary Burn Figure */}
        <div className="mt-4 flex flex-col gap-1 border-t border-border/50 pt-4 sm:flex-row sm:items-baseline sm:justify-between">
          <div>
            <span className="text-2xs font-semibold tracking-wider text-foreground-muted uppercase">
              Average Essential Spend
            </span>
            <div className="text-2xl font-bold tracking-tight text-foreground font-mono">
              {displayValue}
            </div>
          </div>

          <div className="text-xs text-foreground-muted sm:text-right">
            {data.quality === "complete" ? (
              <span>Full 3-month baseline established</span>
            ) : data.quality === "limited" ? (
              <span className="text-accent font-medium">
                Limited baseline ({data.observedCompleteMonthCount}/3 complete months)
              </span>
            ) : (
              <span className="text-foreground-muted">No complete month history recorded</span>
            )}
          </div>
        </div>

        {/* Classification Warning / Suggestion */}
        {hasClassificationIssues ? (
          <div className="mt-3 flex items-start gap-2 rounded-xl border border-accent/25 bg-accent/5 p-2.5 text-2xs text-foreground-muted">
            <AlertCircle className="h-4 w-4 text-accent shrink-0 mt-0.5" />
            <div className="flex-1">
              <span>Uncategorized or ungrouped expenses detected. </span>
              <Link
                href="/transactions"
                className="font-semibold text-accent hover:underline inline-flex items-center gap-0.5"
              >
                <span>Review transactions</span>
                <ArrowRight className="h-2.5 w-2.5" />
              </Link>
            </div>
          </div>
        ) : null}
      </div>

      <BurnBreakdownDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} data={data} />
    </>
  );
}
