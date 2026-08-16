"use client";

import {
  formatMinor,
  type Goal,
  type GoalFeasibilityReport,
  type GoalScenarioType,
  type SafetyBufferState
} from "@treasury-ops/shared";
import { useState } from "react";
import type { ReactNode } from "react";

import { SignedMoney } from "@/components/ui/money";
import { SafetyBufferDrawer } from "./safety-buffer-drawer";

type GoalFeasibilityStudioProps = Readonly<{
  feasibility: GoalFeasibilityReport | null;
  safetyBuffer: SafetyBufferState | null;
  activeGoals: readonly Goal[];
  selectedScenarioType: GoalScenarioType;
  onSelectScenarioType: (type: GoalScenarioType) => void;
}>;

const statusBadgeStyles = {
  feasible: "border-income/30 bg-income/10 text-income",
  delayed: "border-warning/30 bg-warning/10 text-warning",
  at_risk: "border-expense/30 bg-expense/10 text-expense",
  overdue: "border-expense/40 bg-expense/15 text-expense font-bold",
  achieved: "border-accent/30 bg-accent/10 text-accent",
  indeterminate: "border-border bg-surface-muted text-foreground-muted"
} as const;

const statusLabels = {
  feasible: "Feasible",
  delayed: "Delayed",
  at_risk: "At Risk",
  overdue: "Overdue",
  achieved: "Achieved",
  indeterminate: "Pending Data"
} as const;

function formatDate(date: Date | string | null): string {
  if (!date) return "—";
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleDateString("en-IN", { month: "short", year: "numeric" });
}

export function GoalFeasibilityStudio({
  feasibility,
  safetyBuffer,
  activeGoals,
  selectedScenarioType,
  onSelectScenarioType
}: GoalFeasibilityStudioProps): ReactNode {
  const [drawerOpen, setDrawerOpen] = useState(false);

  if (!feasibility || activeGoals.length === 0) {
    return null;
  }

  const currentScenario =
    feasibility.scenarios.find((s) => s.scenarioType === selectedScenarioType) ??
    feasibility.scenarios[0];

  return (
    <section
      aria-labelledby="feasibility-heading"
      className="rounded-2xl border border-border bg-surface p-6 shadow-sm"
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border pb-5">
        <div>
          <div className="flex items-center gap-2">
            <h2
              id="feasibility-heading"
              className="text-lg font-bold tracking-tight text-foreground"
            >
              Goal Feasibility & Cashflow Allocations
            </h2>
            <span className="rounded-full border border-border bg-surface-muted px-2.5 py-0.5 text-2xs font-medium text-foreground-muted">
              Read-Only Advisory
            </span>
          </div>
          <p className="mt-1 text-xs text-foreground-muted">
            Simulated scenarios matching required goal contributions with conservative forecast cash
            flow
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            className="flex items-center gap-1.5 rounded-xl border border-border bg-surface-elevated px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-surface-muted hover:border-accent transition-colors"
          >
            <span>🛡️ Cushion:</span>
            <span className="text-accent font-bold">
              {formatMinor(feasibility.safetyBufferTargetMinor)}
            </span>
          </button>
        </div>
      </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 my-5">
        <div className="rounded-xl border border-border bg-surface-muted/40 p-3.5">
          <p className="text-2xs font-medium text-foreground-muted">Available Monthly Cash</p>
          <p className="mt-1 text-lg font-bold text-foreground">
            {formatMinor(feasibility.conservativeAvailableMonthlyMinor)}/mo
          </p>
          <span className="text-3xs text-foreground-muted">Conservative forecast</span>
        </div>

        <div className="rounded-xl border border-border bg-surface-muted/40 p-3.5">
          <p className="text-2xs font-medium text-foreground-muted">Required Monthly Total</p>
          <p className="mt-1 text-lg font-bold text-foreground">
            {formatMinor(feasibility.totalRequiredMonthlyMinor)}/mo
          </p>
          <span className="text-3xs text-foreground-muted">Across active deadlines</span>
        </div>

        <div className="rounded-xl border border-border bg-surface-muted/40 p-3.5">
          <p className="text-2xs font-medium text-foreground-muted">Monthly Surplus / Gap</p>
          <div className="mt-1">
            <SignedMoney minor={feasibility.monthlySurplusMinor} size="md" />
          </div>
          <span className="text-3xs text-foreground-muted">Net cash generation</span>
        </div>

        <div className="rounded-xl border border-border bg-surface-muted/40 p-3.5">
          <p className="text-2xs font-medium text-foreground-muted">Safety Cushion Reserve</p>
          <p className="mt-1 text-lg font-bold text-foreground">
            {formatMinor(feasibility.liquidBalanceMinor)}
          </p>
          <span
            className={`text-3xs font-medium ${feasibility.liquidBufferGapMinor > 0 ? "text-warning" : "text-income"}`}
          >
            {feasibility.liquidBufferGapMinor > 0
              ? `${formatMinor(feasibility.liquidBufferGapMinor)} gap to buffer`
              : "Buffer fully funded"}
          </span>
        </div>
      </div>

      {/* Scenario Tabs */}
      <div className="mt-6">
        <div className="flex border-b border-border gap-2">
          {feasibility.scenarios.map((scenario) => {
            const active = scenario.scenarioType === selectedScenarioType;
            return (
              <button
                key={scenario.scenarioType}
                type="button"
                onClick={() => onSelectScenarioType(scenario.scenarioType)}
                className={`pb-2.5 px-3 text-xs font-semibold transition-colors border-b-2 -mb-px ${
                  active
                    ? "border-accent text-accent"
                    : "border-transparent text-foreground-muted hover:text-foreground hover:border-border"
                }`}
              >
                {scenario.name}
              </button>
            );
          })}
        </div>

        {currentScenario ? (
          <div className="mt-3">
            <p className="text-xs text-foreground-muted mb-4">{currentScenario.description}</p>

            <div className="overflow-x-auto rounded-xl border border-border">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-border bg-surface-muted/60 text-foreground-muted text-2xs uppercase tracking-wider font-semibold">
                  <tr>
                    <th className="py-2.5 px-3">Goal</th>
                    <th className="py-2.5 px-3">Target Date</th>
                    <th className="py-2.5 px-3 text-right">Required/mo</th>
                    <th className="py-2.5 px-3 text-right">Allocated/mo</th>
                    <th className="py-2.5 px-3">Projected Range</th>
                    <th className="py-2.5 px-3 text-right">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {currentScenario.allocations.map((alloc) => (
                    <tr key={alloc.goalId} className="hover:bg-surface-muted/30 transition-colors">
                      <td className="py-3 px-3">
                        <span className="font-semibold text-foreground">{alloc.goalName}</span>
                        <p className="text-3xs text-foreground-muted mt-0.5">
                          {alloc.explainability}
                        </p>
                      </td>
                      <td className="py-3 px-3 text-foreground-muted">
                        {alloc.targetDate ? formatDate(alloc.targetDate) : "No deadline"}
                      </td>
                      <td className="py-3 px-3 text-right font-medium text-foreground">
                        {alloc.requiredMonthlyMinor !== null
                          ? formatMinor(alloc.requiredMonthlyMinor)
                          : "—"}
                      </td>
                      <td className="py-3 px-3 text-right font-bold text-foreground">
                        {formatMinor(alloc.allocatedMonthlyMinor)}
                      </td>
                      <td className="py-3 px-3 text-foreground-muted">
                        {alloc.projectedRange.baselineDate ? (
                          <span className="font-mono text-2xs">
                            {formatDate(alloc.projectedRange.optimisticDate)} –{" "}
                            {formatDate(alloc.projectedRange.pessimisticDate)}
                          </span>
                        ) : (
                          "Indeterminate"
                        )}
                      </td>
                      <td className="py-3 px-3 text-right">
                        <span
                          className={`inline-flex rounded-md border px-2 py-0.5 text-2xs font-semibold ${statusBadgeStyles[alloc.status]}`}
                        >
                          {statusLabels[alloc.status]}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}
      </div>

      <SafetyBufferDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        state={safetyBuffer}
        activeGoals={activeGoals}
      />
    </section>
  );
}
