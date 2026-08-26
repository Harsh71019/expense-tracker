"use client";

import type { SafetyEvaluation } from "@treasury-ops/shared";
import { Layers, RefreshCw, ShieldAlert } from "lucide-react";
import { useState } from "react";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useRefreshSafetyEvaluation } from "../hooks/use-refresh-safety-evaluation";
import { useSafetyEvaluation } from "../hooks/use-safety-evaluation";
import { getSafetyActionConfig } from "../model/safety-actions";
import { RunwayClock } from "./runway-clock";
import { SafetyEvidenceDrawer } from "./safety-evidence-drawer";
import { SafetyLadder } from "./safety-ladder";
import { SafetyNextAction } from "./safety-next-action";

export interface SafetyStatusPanelProps {
  readonly initialData: SafetyEvaluation | null;
  readonly className?: string;
}

/**
 * The dashboard's primary safety visualization: the Runway Clock and Safety
 * Ladder, composed from one authoritative Safety Evaluation. Owns the
 * primary safety action once its inputs are readable, per the dashboard
 * composition rule that Data Readiness and Essential Burn stay supporting
 * evidence rather than competing calls to action.
 *
 * A fetch/schema failure renders this panel's own error state -- it never
 * throws into the surrounding dashboard tree.
 */
export function SafetyStatusPanel({
  initialData,
  className = ""
}: SafetyStatusPanelProps): ReactNode {
  const { data, error, isFetching } = useSafetyEvaluation(initialData);
  const refresh = useRefreshSafetyEvaluation();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [announcement, setAnnouncement] = useState("");

  const wrapperClass = ["flex flex-col gap-4", className].filter(Boolean).join(" ");

  if (error && !data) {
    return (
      <div className={wrapperClass}>
        <div className="rounded-2xl border border-border/80 bg-surface p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-problem/10 text-problem">
              <ShieldAlert className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-foreground">Safety status</h3>
              <p className="text-xs text-problem">Failed to load the Safety Evaluation.</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className={wrapperClass}>
        <div className="rounded-2xl border border-border/80 bg-surface p-5 shadow-sm">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="mt-4 h-8 w-32" />
          <Skeleton className="mt-4 h-3 w-full" />
        </div>
      </div>
    );
  }

  const nextActionConfig = getSafetyActionConfig(data.nextAction);

  return (
    <div className={wrapperClass}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-base font-bold text-foreground">Safety status</h2>
          <p className="text-xs text-foreground-muted">
            Your runway and safety ladder, composed from your current financial facts.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="inline-flex items-center gap-1.5"
            onClick={() => setDrawerOpen(true)}
          >
            <Layers className="h-3.5 w-3.5" />
            <span>Evidence</span>
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="inline-flex items-center gap-1.5"
            disabled={refresh.isPending}
            onClick={() => {
              refresh.mutate(undefined, {
                onSuccess: () => setAnnouncement("Safety evaluation refreshed.")
              });
            }}
          >
            <RefreshCw className={`h-3.5 w-3.5 ${refresh.isPending ? "animate-spin" : ""}`} />
            <span>{refresh.isPending ? "Refreshing…" : "Refresh"}</span>
          </Button>
        </div>
      </div>

      <div aria-live="polite" className="sr-only">
        {announcement}
      </div>

      {isFetching ? (
        <p className="text-2xs text-foreground-muted" aria-hidden="true">
          Updating…
        </p>
      ) : null}

      <RunwayClock evaluation={data} />

      {nextActionConfig ? (
        <div className="rounded-2xl border border-accent/30 bg-accent-glow p-4">
          <p className="text-xs font-semibold text-foreground">Your next safety action</p>
          <div className="mt-2">
            <SafetyNextAction action={nextActionConfig} />
          </div>
        </div>
      ) : null}

      <SafetyLadder evaluation={data} />

      <SafetyEvidenceDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        evaluation={data}
      />
    </div>
  );
}
