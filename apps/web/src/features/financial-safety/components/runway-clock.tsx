"use client";

import type { SafetyEvaluation } from "@treasury-ops/shared";
import type { ReactNode } from "react";

import { Badge } from "@/components/ui/badge";
import { Money } from "@/components/ui/money";

import {
  criticalMarkerRatio,
  formatRunwayDays,
  formatRunwayMonths,
  getRunwayTierCopy,
  getRunwayUnavailableCopy,
  runwayGeometryRatio
} from "../model/runway-presentation";
import { getSafetyActionConfig } from "../model/safety-actions";
import { SafetyNextAction } from "./safety-next-action";

export interface RunwayClockProps {
  readonly evaluation: SafetyEvaluation;
}

/**
 * The primary financial-safety visualization: months of essential runway
 * without salary. Every number is read straight off the backend result --
 * this component only converts an already-computed ratio into pixels for
 * the bar and formats an already-computed integer for display.
 *
 * Color is never the only signal: every tier carries a text label, a badge,
 * and a written description, and the fill bar has a full text equivalent
 * below it for screen readers and narrow layouts alike.
 */
export function RunwayClock({ evaluation }: RunwayClockProps): ReactNode {
  const { runway, quality } = evaluation;
  const tierCopy = getRunwayTierCopy(runway.tier);

  if (runway.availability === "unavailable") {
    const action = getSafetyActionConfig(evaluation.nextAction);
    return (
      <div className="rounded-2xl border border-border/80 bg-surface p-5 shadow-sm">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-bold text-foreground">Runway clock</h3>
          <Badge variant="problem">Unavailable</Badge>
        </div>
        <p className="mt-3 text-sm font-semibold text-foreground">{tierCopy.headline}</p>
        <p className="mt-1 text-xs text-foreground-muted">
          {getRunwayUnavailableCopy(runway.unavailableReason)}
        </p>
        {action ? (
          <div className="mt-4">
            <SafetyNextAction action={action} />
          </div>
        ) : null}
      </div>
    );
  }

  const fillRatio = runwayGeometryRatio(runway);
  const criticalRatio = criticalMarkerRatio(runway);
  const monthsLabel = formatRunwayMonths(runway.runwayBasisPoints ?? 0);

  return (
    <div className="rounded-2xl border border-border/80 bg-surface p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-bold text-foreground">Runway clock</h3>
        <Badge variant={tierCopy.badgeVariant}>{tierCopy.label}</Badge>
      </div>

      <div className="mt-3 flex items-baseline gap-2">
        <span className="font-mono text-3xl font-extrabold tracking-tight text-foreground">
          {monthsLabel}
        </span>
        <span className="text-sm font-semibold text-foreground-muted">months without salary</span>
      </div>
      <p className="mt-1 text-xs text-foreground-muted">
        {formatRunwayDays(runway.runwayDays ?? 0)} of essential spending covered.{" "}
        {tierCopy.headline}
      </p>

      {quality === "limited" ? (
        <p className="mt-2 rounded-lg border border-accent/30 bg-accent-glow px-2.5 py-1.5 text-2xs font-semibold text-accent">
          Estimate based on limited expense history.
        </p>
      ) : null}

      <div
        className="relative mt-4 h-3 w-full overflow-hidden rounded-full bg-surface-muted"
        role="img"
        aria-label={`${monthsLabel} months of runway out of a six-month fortified benchmark`}
      >
        <div
          className="h-full rounded-full bg-accent transition-[width] duration-700 ease-out motion-reduce:transition-none"
          style={{ width: `${(fillRatio * 100).toFixed(1)}%` }}
        />
        <div
          className="absolute inset-y-0 w-px bg-foreground/40"
          style={{ left: `${(criticalRatio * 100).toFixed(1)}%` }}
          aria-hidden="true"
        />
      </div>
      <div className="mt-1 flex justify-between text-3xs font-semibold uppercase tracking-wider text-foreground-muted">
        <span>0 mo</span>
        <span>3 mo · critical threshold</span>
        <span>6 mo · fortified</span>
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-border/50 pt-4 text-xs">
        <div>
          <dt className="text-foreground-muted">Eligible reserves</dt>
          <dd className="mt-0.5 font-semibold text-foreground">
            {runway.eligibleReserveMinor !== null ? (
              <Money minor={runway.eligibleReserveMinor} size="sm" />
            ) : (
              "—"
            )}
          </dd>
        </div>
        <div>
          <dt className="text-foreground-muted">Essential burn</dt>
          <dd className="mt-0.5 font-semibold text-foreground">
            {runway.essentialBurnMinor !== null ? (
              <Money minor={runway.essentialBurnMinor} size="sm" />
            ) : (
              "—"
            )}
          </dd>
        </div>
        <div className="col-span-2">
          <dt className="text-foreground-muted">Months of history observed</dt>
          <dd className="mt-0.5 font-semibold text-foreground">
            {runway.observedCompleteMonthCount} of 3
          </dd>
        </div>
      </dl>

      <p className="mt-4 text-2xs text-foreground-muted">
        Reaching a benchmark is not a guarantee -- it reflects the reserves and spending TreasuryOps
        can currently see.
      </p>
    </div>
  );
}
