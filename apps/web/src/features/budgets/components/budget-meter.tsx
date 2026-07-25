import type { BudgetProgress } from "@treasury-ops/shared";
import type { ReactNode } from "react";

import {
  budgetMeterValueText,
  clampedMeterPercent,
  utilizationPercent
} from "../model/presentation";

type BudgetMeterProps = Readonly<{
  progress: BudgetProgress;
}>;

const fillClasses = {
  under: "bg-accent",
  approaching: "bg-income",
  reached: "bg-expense"
} as const;

export function BudgetMeter({ progress }: BudgetMeterProps): ReactNode {
  const visiblePercent = utilizationPercent(progress.utilizationBps);
  const meterPercent = clampedMeterPercent(progress.utilizationBps);

  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-3">
        <span className="text-xs font-medium text-foreground-muted">Monthly utilization</span>
        <span className="font-mono text-xs font-bold text-foreground tabular-nums">
          {visiblePercent}% used
        </span>
      </div>
      <div
        role="meter"
        aria-label={`${progress.category.name} monthly budget`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={meterPercent}
        aria-valuetext={budgetMeterValueText(progress)}
        className="h-2.5 overflow-hidden rounded-full bg-surface-muted"
      >
        <div
          className={`h-full rounded-full motion-safe:transition-[width] motion-safe:duration-300 ${fillClasses[progress.state]}`}
          style={{ width: `${meterPercent}%` }}
        />
      </div>
    </div>
  );
}
