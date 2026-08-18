"use client";

import type { FinancialCapabilityKey } from "@treasury-ops/shared";
import { CheckCircle2, Lock, Sparkles } from "lucide-react";
import type { ReactNode } from "react";

interface CapabilityInfo {
  readonly title: string;
  readonly description: string;
  readonly requirements: string;
}

const CAPABILITY_CATALOG: Record<FinancialCapabilityKey, CapabilityInfo> = {
  salary_statistics: {
    title: "Salary Statistics & Take-Home",
    description: "Derives daily, hourly, and effective net income baselines.",
    requirements: "Requires confirmed salary profile."
  },
  life_hour: {
    title: "Life-Hour Worth Metric",
    description: "Evaluates purchases and expenses in hours of life worked.",
    requirements: "Requires confirmed salary and work schedule."
  },
  essential_burn: {
    title: "Essential Burn Baseline",
    description: "Computes true non-negotiable monthly living expenses.",
    requirements: "Requires classified categories & 3 complete months of history."
  },
  goal_feasibility: {
    title: "Goal Feasibility Simulations",
    description: "Tests target milestones against savings rate and safety buffers.",
    requirements: "Requires salary, emergency buffer, and active goals."
  },
  financial_runway: {
    title: "Financial Runway Engine",
    description: "Measures exact months of emergency survival on liquid cash.",
    requirements: "Requires essential burn baseline and liquid accounts."
  },
  safety_ladder: {
    title: "Safety Ladder Verification",
    description: "Audits insurance coverage, high-cost debt clearance, and buffers.",
    requirements: "Requires protection profile, debt inventory, and safety buffer."
  },
  payday_plan: {
    title: "Payday Allocation Planner",
    description: "Deterministic routing of monthly salary to bills, debts, and goals.",
    requirements: "Requires salary, accounts, and debt inventory."
  },
  wealth_allocation: {
    title: "Wealth Allocation Matrix",
    description: "Asset class distribution and valuation monitoring.",
    requirements: "Requires active assets and up-to-date valuations."
  },
  projections: {
    title: "Forward Projections",
    description: "Simulates multi-year net worth trajectories and milestone achievement.",
    requirements: "Requires complete copilot profile."
  }
};

export function AvailableCapabilitiesCard({
  availableCapabilities,
  unavailableCapabilities
}: Readonly<{
  availableCapabilities: readonly FinancialCapabilityKey[];
  unavailableCapabilities: readonly FinancialCapabilityKey[];
}>): ReactNode {
  return (
    <div className="rounded-xl border border-border/80 bg-surface p-5">
      <div className="flex items-center gap-2 mb-4">
        <Sparkles className="h-5 w-5 text-accent" />
        <h3 className="text-sm font-semibold text-foreground">Financial Copilot Capabilities</h3>
        <span className="ml-auto font-mono text-xs font-medium text-foreground-muted">
          {availableCapabilities.length} Unlocked
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {availableCapabilities.map((cap) => {
          const info = CAPABILITY_CATALOG[cap];
          if (!info) return null;
          return (
            <div
              key={cap}
              className="flex items-start gap-3 rounded-lg border border-income/20 bg-income/5 p-3"
            >
              <CheckCircle2 className="h-4 w-4 shrink-0 text-income mt-0.5" />
              <div>
                <h4 className="text-xs font-semibold text-foreground">{info.title}</h4>
                <p className="text-2xs text-foreground-muted mt-0.5">{info.description}</p>
              </div>
            </div>
          );
        })}

        {unavailableCapabilities.map((cap) => {
          const info = CAPABILITY_CATALOG[cap];
          if (!info) return null;
          return (
            <div
              key={cap}
              className="flex items-start gap-3 rounded-lg border border-border/50 bg-surface-muted/30 p-3 opacity-70"
            >
              <Lock className="h-4 w-4 shrink-0 text-foreground-muted mt-0.5" />
              <div>
                <h4 className="text-xs font-medium text-foreground-muted">{info.title}</h4>
                <p className="text-2xs text-foreground-muted/80 mt-0.5">{info.requirements}</p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
