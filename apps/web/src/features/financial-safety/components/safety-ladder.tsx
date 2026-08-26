"use client";

import type { SafetyCheck, SafetyEvaluation, SafetyStage } from "@treasury-ops/shared";
import { CheckCircle2, Circle, Lock } from "lucide-react";
import type { ReactNode } from "react";

import { Badge } from "@/components/ui/badge";
import { SafetyCheckRow } from "./safety-check-row";

const STAGE_ORDER: readonly SafetyStage[] = [
  "ground_zero",
  "building_fortress",
  "buffer_layer",
  "wealth_ready"
];

const STAGE_LABELS: Record<SafetyStage, string> = {
  ground_zero: "Ground Zero",
  building_fortress: "Building Fortress",
  buffer_layer: "Buffer Layer",
  wealth_ready: "Wealth Ready"
};

const STAGE_DESCRIPTIONS: Record<SafetyStage, string> = {
  ground_zero: "Protection is configured and no high-cost debt remains.",
  building_fortress: "Essential burn and eligible reserves are building toward the runway target.",
  buffer_layer: "The runway target is met; short-term sinking funds are being established next.",
  wealth_ready: "All safety requirements, including sinking-fund readiness, are satisfied."
};

function stageStatus(
  stage: SafetyStage,
  currentStage: SafetyStage
): "complete" | "current" | "pending" {
  const currentIndex = STAGE_ORDER.indexOf(currentStage);
  const stageIndex = STAGE_ORDER.indexOf(stage);
  if (stageIndex < currentIndex) return "complete";
  if (stageIndex === currentIndex) return "current";
  return "pending";
}

function StageMarker({
  status
}: {
  readonly status: "complete" | "current" | "pending";
}): ReactNode {
  if (status === "complete") {
    return <CheckCircle2 className="h-5 w-5 text-income" aria-hidden="true" />;
  }
  if (status === "current") {
    return <Circle className="h-5 w-5 fill-accent/20 text-accent" aria-hidden="true" />;
  }
  return <Lock className="h-5 w-5 text-foreground-muted" aria-hidden="true" />;
}

const STAGE_STATUS_TEXT: Record<"complete" | "current" | "pending", string> = {
  complete: "Completed",
  current: "Current stage",
  pending: "Not yet reached"
};

export interface SafetyLadderProps {
  readonly evaluation: SafetyEvaluation;
}

/**
 * The sequential Safety Ladder: four stages, each with its own checks,
 * evidence, and unmet requirements. Stage status is never color-only -- an
 * icon, a text label, and an accessible description accompany every stage.
 */
export function SafetyLadder({ evaluation }: SafetyLadderProps): ReactNode {
  const checksByStage = new Map<SafetyStage, SafetyCheck[]>();
  for (const check of evaluation.checks) {
    const bucket = checksByStage.get(check.stage) ?? [];
    bucket.push(check);
    checksByStage.set(check.stage, bucket);
  }

  return (
    <div className="rounded-2xl border border-border/80 bg-surface p-5 shadow-sm">
      <h3 className="text-sm font-bold text-foreground">Safety ladder</h3>
      <p className="mt-1 text-xs text-foreground-muted">
        Sequential stages, each building on the last -- reaching a benchmark unlocks the next.
      </p>

      <ol className="mt-4 space-y-4">
        {STAGE_ORDER.map((stage) => {
          const status = stageStatus(stage, evaluation.currentStage);
          const checks = checksByStage.get(stage) ?? [];

          return (
            <li
              key={stage}
              className="rounded-xl border border-border/60 bg-surface-muted/20 p-3.5"
            >
              <div className="flex items-center gap-2.5">
                <StageMarker status={status} />
                <div className="flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-bold text-foreground">{STAGE_LABELS[stage]}</span>
                    {status === "current" ? <Badge variant="accent">Current</Badge> : null}
                  </div>
                  <p className="text-xs text-foreground-muted">{STAGE_DESCRIPTIONS[stage]}</p>
                  <span className="sr-only">{STAGE_STATUS_TEXT[status]}</span>
                </div>
              </div>

              {stage === "wealth_ready" && checks.length === 0 ? (
                <p className="mt-3 pl-8 text-2xs text-foreground-muted">
                  Wealth Ready requires sinking-fund readiness, which explicit sinking-fund
                  classification will make assessable in a future release. It is never assumed from
                  an existing goal.
                </p>
              ) : null}

              {checks.length > 0 ? (
                <ul className="mt-3 space-y-2 pl-8">
                  {checks.map((check) => (
                    <SafetyCheckRow key={check.key} check={check} />
                  ))}
                </ul>
              ) : null}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
