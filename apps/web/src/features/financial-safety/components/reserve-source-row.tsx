"use client";

import type { ReserveSource } from "@treasury-ops/shared";
import type { ReactNode } from "react";

import { Badge } from "@/components/ui/badge";
import { Money } from "@/components/ui/money";

import {
  formatValuationAge,
  getExclusionCopy,
  getFreshnessLabel,
  LIQUIDITY_TIER_LABELS,
  sourceTypeLabel
} from "../model/reserve-presentation";

export interface ReserveSourceRowProps {
  readonly source: ReserveSource;
  readonly asOf: Date;
  readonly onEdit: (source: ReserveSource) => void;
}

/**
 * One row of the reserve source manager. Every value shown here (current
 * value, eligible value, freshness) is read directly off the evaluated
 * `ReserveSource` from the API -- nothing is recomputed client-side.
 */
export function ReserveSourceRow({ source, asOf, onEdit }: ReserveSourceRowProps): ReactNode {
  const exclusion = getExclusionCopy(source.exclusionReason);
  const isConfigured = source.configuration !== null;

  return (
    <li className="flex flex-col gap-3 rounded-xl border border-border/70 bg-surface p-3.5 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="truncate text-sm font-semibold text-foreground">
            {source.displayName}
          </span>
          <Badge variant={source.sourceKind === "account" ? "info" : "accent"}>
            {sourceTypeLabel(source.sourceType)}
          </Badge>
          {isConfigured ? (
            <Badge variant={source.eligibility === "eligible" ? "success" : "pending"}>
              {source.eligibility === "eligible"
                ? LIQUIDITY_TIER_LABELS[source.configuration?.liquidityTier ?? "locked"]
                : exclusion.label}
            </Badge>
          ) : (
            <Badge variant="pending">Not configured</Badge>
          )}
        </div>

        <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-foreground-muted">
          <span>
            Current value:{" "}
            {source.currentValueMinor === null ? (
              <span className="text-foreground-muted">Unavailable</span>
            ) : (
              <Money minor={Math.max(source.currentValueMinor, 0)} size="sm" />
            )}
          </span>
          {isConfigured ? (
            <span>
              Eligible: <Money minor={source.eligibleMinor} size="sm" />
            </span>
          ) : null}
          {source.freshness !== "not_applicable" ? (
            <span className={source.freshness === "stale" ? "text-accent" : undefined}>
              {getFreshnessLabel(source.freshness)} · {formatValuationAge(source.valuedAt, asOf)}
            </span>
          ) : null}
          {source.isUnavailable ? (
            <span className="text-accent">
              {source.sourceKind === "account" ? "Archived" : "Closed"}
            </span>
          ) : null}
        </div>

        {source.exclusionReason !== "none" ? (
          <p
            className={`mt-1 text-2xs ${exclusion.tone === "warning" ? "text-accent" : "text-foreground-muted"}`}
          >
            {exclusion.label}
          </p>
        ) : null}
      </div>

      <div className="shrink-0">
        <button
          type="button"
          onClick={() => onEdit(source)}
          className="min-h-11 rounded-lg border border-border bg-surface-muted px-3.5 text-xs font-semibold text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          {isConfigured ? "Edit" : "Classify"}
        </button>
      </div>
    </li>
  );
}
