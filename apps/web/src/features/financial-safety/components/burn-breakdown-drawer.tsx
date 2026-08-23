"use client";

import { formatMinor, type EssentialBurnResponse } from "@treasury-ops/shared";
import { AlertCircle, ArrowRight, Calendar, CheckCircle2, HelpCircle, X } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { Badge } from "@/components/ui/badge";
import { DialogSurface } from "@/components/ui/dialog";
import {
  formatMonthLabel,
  getObservedMonthsWording,
  getQualityBadgeConfig,
  hasClassificationLimitations
} from "../model/burn-presentation";

export interface BurnBreakdownDrawerProps {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly data: EssentialBurnResponse | null;
}

export function BurnBreakdownDrawer({ open, onClose, data }: BurnBreakdownDrawerProps): ReactNode {
  if (!open || !data) return null;

  const badgeConfig = getQualityBadgeConfig(data.quality);
  const hasClassificationIssues = hasClassificationLimitations(data.limitations);

  return (
    <DialogSurface
      labelledBy="essential-burn-breakdown-title"
      describedBy="essential-burn-breakdown-description"
      onClose={onClose}
      variant="drawer"
      panelClassName="max-w-[540px]"
    >
      <div className="flex items-start justify-between gap-4 border-b border-border/80 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <p className="font-mono text-2xs font-bold tracking-[0.2em] text-accent uppercase">
              Financial Safety
            </p>
            <Badge variant={badgeConfig.variant}>{badgeConfig.label}</Badge>
          </div>
          <h2
            id="essential-burn-breakdown-title"
            className="mt-1 text-xl font-bold text-foreground"
          >
            Essential Monthly Burn
          </h2>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close essential burn breakdown"
          className="grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-border bg-surface-muted text-foreground-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="mt-4 space-y-6">
        {/* Baseline Summary Card */}
        <div className="rounded-2xl border border-border bg-surface-muted/40 p-4">
          <div className="flex items-baseline justify-between">
            <span className="text-xs font-semibold text-foreground-muted">
              Average Essential Outflow
            </span>
            <span className="text-2xl font-bold tracking-tight text-foreground font-mono">
              {data.averageMonthlyEssentialMinor !== null
                ? formatMinor(data.averageMonthlyEssentialMinor)
                : "—"}
            </span>
          </div>
          <p
            id="essential-burn-breakdown-description"
            className="mt-1 text-xs text-foreground-muted"
          >
            {getObservedMonthsWording(data.observedCompleteMonthCount)} • 3 complete IST calendar
            months required
          </p>
        </div>

        {/* Complete Months Timeline */}
        <div>
          <h3 className="text-xs font-mono font-bold tracking-wider text-foreground uppercase mb-3 flex items-center gap-1.5">
            <Calendar className="h-3.5 w-3.5 text-accent" />
            Complete Months Baseline
          </h3>
          <div className="space-y-2.5">
            {data.completeMonths.map((m) => {
              const isObserved = m.observation === "observed";
              return (
                <div
                  key={m.month}
                  className="flex items-center justify-between rounded-xl border border-border/70 bg-surface p-3.5"
                >
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-foreground">
                        {formatMonthLabel(m.month)}
                      </span>
                      {isObserved ? (
                        <span className="inline-flex items-center gap-1 text-2xs font-medium text-income">
                          <CheckCircle2 className="h-3 w-3" />
                          Observed
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-2xs font-medium text-foreground-muted">
                          <HelpCircle className="h-3 w-3" />
                          Missing history
                        </span>
                      )}
                    </div>
                    <p className="text-2xs text-foreground-muted">
                      {isObserved
                        ? `${m.essentialTransactionCount} essential of ${m.eligibleExpenseTransactionCount} eligible expenses`
                        : "No eligible expense transactions recorded"}
                    </p>
                  </div>
                  <div className="text-right">
                    <span className="text-sm font-bold font-mono text-foreground">
                      {isObserved ? formatMinor(m.essentialTotalMinor) : "—"}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Current Partial Month (Excluded) */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-xs font-mono font-bold tracking-wider text-foreground uppercase">
              Current Partial Month
            </h3>
            <span className="rounded-md border border-border bg-surface-muted px-2 py-0.5 text-3xs font-semibold text-foreground-muted uppercase tracking-wider">
              Excluded from baseline
            </span>
          </div>
          <div className="rounded-xl border border-dashed border-border bg-surface-muted/30 p-3.5 flex items-center justify-between">
            <div className="space-y-0.5">
              <span className="text-sm font-semibold text-foreground">
                {formatMonthLabel(data.currentPartialMonth.month)} (Month-to-date)
              </span>
              <p className="text-2xs text-foreground-muted">
                {data.currentPartialMonth.essentialTransactionCount} essential of{" "}
                {data.currentPartialMonth.eligibleExpenseTransactionCount} expenses recorded so far
              </p>
            </div>
            <div className="text-right">
              <span className="text-sm font-semibold font-mono text-foreground">
                {formatMinor(data.currentPartialMonth.essentialTotalMinor)}
              </span>
            </div>
          </div>
        </div>

        {/* Classification Evidence */}
        <div className="rounded-2xl border border-border bg-surface p-4 space-y-3">
          <h3 className="text-xs font-mono font-bold tracking-wider text-foreground uppercase">
            Classification & Coverage Evidence
          </h3>
          <div className="grid grid-cols-2 gap-2.5 text-xs">
            <div className="rounded-lg bg-surface-muted/50 p-2.5">
              <span className="text-foreground-muted block text-2xs">Essential Transactions</span>
              <span className="font-semibold text-foreground">
                {data.classification.essentialExpenseTransactionCount}
              </span>
            </div>
            <div className="rounded-lg bg-surface-muted/50 p-2.5">
              <span className="text-foreground-muted block text-2xs">Lifestyle Transactions</span>
              <span className="font-semibold text-foreground">
                {data.classification.lifestyleExpenseTransactionCount}
              </span>
            </div>
            <div className="rounded-lg bg-surface-muted/50 p-2.5">
              <span className="text-foreground-muted block text-2xs">Uncategorized Expenses</span>
              <span className="font-semibold text-foreground">
                {data.classification.uncategorizedExpenseCount} (
                {formatMinor(data.classification.uncategorizedExpenseMinor)})
              </span>
            </div>
            <div className="rounded-lg bg-surface-muted/50 p-2.5">
              <span className="text-foreground-muted block text-2xs">Ungrouped Categories</span>
              <span className="font-semibold text-foreground">
                {data.classification.ungroupedExpenseCount} (
                {formatMinor(data.classification.ungroupedExpenseMinor)})
              </span>
            </div>
          </div>

          {hasClassificationIssues ? (
            <div className="mt-2 rounded-xl border border-accent/30 bg-accent/5 p-3 text-xs text-foreground space-y-2">
              <div className="flex items-start gap-2">
                <AlertCircle className="h-4 w-4 text-accent shrink-0 mt-0.5" />
                <p className="text-2xs leading-relaxed text-foreground-muted">
                  Uncategorized expenses or ungrouped categories were detected in the 3-month
                  window. Classifying them ensures your essential burn baseline is complete and
                  trustworthy.
                </p>
              </div>
              <div className="flex items-center gap-2 pt-1">
                <Link
                  href="/transactions"
                  className="inline-flex items-center gap-1 text-2xs font-semibold text-accent hover:underline"
                >
                  <span>Review transactions</span>
                  <ArrowRight className="h-3 w-3" />
                </Link>
                <span className="text-foreground-muted">•</span>
                <Link
                  href="/categories"
                  className="inline-flex items-center gap-1 text-2xs font-semibold text-accent hover:underline"
                >
                  <span>Review categories</span>
                  <ArrowRight className="h-3 w-3" />
                </Link>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </DialogSurface>
  );
}
