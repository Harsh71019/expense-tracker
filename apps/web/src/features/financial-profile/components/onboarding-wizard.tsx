"use client";

import type { FinancialDiagnostic } from "@treasury-ops/shared";
import { ArrowRight, CheckCircle2, ShieldCheck, Sparkles } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { Badge } from "@/components/ui/badge";
import { useFinancialDiagnostic } from "../hooks/use-financial-diagnostic";
import { getDiagnosticActionConfig } from "../model/diagnostic-actions";
import { AvailableCapabilitiesCard } from "./available-capabilities";
import { ReadinessItemCard } from "./readiness-item";

export function OnboardingWizard({
  initialDiagnostic
}: Readonly<{
  initialDiagnostic: FinancialDiagnostic | null;
}>): ReactNode {
  const { data: diagnostic } = useFinancialDiagnostic(initialDiagnostic);

  if (!diagnostic) {
    return (
      <div className="rounded-xl border border-border bg-surface p-8 text-center text-foreground-muted">
        Unable to load financial readiness diagnostic. Please try again.
      </div>
    );
  }

  const nextActionConfig = getDiagnosticActionConfig(diagnostic.nextAction);
  const progressPercent = Math.min(
    100,
    Math.round((diagnostic.readyCount / diagnostic.totalRequiredCount) * 100)
  );

  const getOverallStatusBadge = () => {
    switch (diagnostic.overallStatus) {
      case "ready":
        return <Badge variant="success">All Core Steps Ready</Badge>;
      case "limited":
        return <Badge variant="accent">Partial Setup</Badge>;
      case "setup_required":
        return <Badge variant="problem">Setup Required</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      {/* Overview Card */}
      <div className="rounded-2xl border border-border/80 bg-surface p-6 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2.5">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent/10 text-accent">
                <ShieldCheck className="h-5 w-5" />
              </span>
              <div>
                <h2 className="text-lg font-bold text-foreground">Financial Copilot Readiness</h2>
                <div className="mt-1 flex items-center gap-2">
                  {getOverallStatusBadge()}
                  <span className="text-xs text-foreground-muted">
                    {diagnostic.readyCount} of {diagnostic.totalRequiredCount} core prerequisites
                    completed
                  </span>
                </div>
              </div>
            </div>
          </div>

          {nextActionConfig ? (
            <Link
              href={nextActionConfig.href}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-accent px-5 py-3 text-sm font-semibold text-accent-foreground shadow-sm transition-all hover:bg-accent-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              <span>{nextActionConfig.label}</span>
              <ArrowRight className="h-4 w-4" />
            </Link>
          ) : (
            <Link
              href="/"
              className="inline-flex items-center gap-2 rounded-xl border border-income/30 bg-income/10 px-4 py-2.5 text-xs font-semibold text-income transition-colors hover:bg-income/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-income"
            >
              <CheckCircle2 className="h-4 w-4" />
              <span>View Dashboard</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          )}
        </div>

        {/* Progress bar */}
        <div className="mt-5">
          <div className="flex justify-between text-xs font-medium text-foreground-muted mb-1.5">
            <span>Readiness Progress</span>
            <span className="font-mono">{progressPercent}%</span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-surface-muted">
            <div
              className="h-full bg-accent transition-all duration-300 ease-out"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>

        {/* Next recommended step or completion callout */}
        {nextActionConfig ? (
          <div className="mt-5 flex items-start gap-3 rounded-xl border border-accent/20 bg-accent/5 p-4">
            <Sparkles className="h-5 w-5 shrink-0 text-accent mt-0.5" />
            <div className="flex-1">
              <h4 className="text-sm font-semibold text-foreground">
                Next Recommended Step: {nextActionConfig.label}
              </h4>
              <p className="mt-0.5 text-xs text-foreground-muted">{nextActionConfig.description}</p>
            </div>
            <Link
              href={nextActionConfig.href}
              className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-accent hover:underline"
            >
              <span>Proceed</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        ) : (
          <div className="mt-5 flex items-start gap-3 rounded-xl border border-income/30 bg-income/5 p-4">
            <CheckCircle2 className="h-5 w-5 shrink-0 text-income mt-0.5" />
            <div className="flex-1">
              <h4 className="text-sm font-semibold text-foreground">
                All Core Prerequisites Completed
              </h4>
              <p className="mt-0.5 text-xs text-foreground-muted">
                Your Financial Runway Clock and Safety Ladder are active on your dashboard.
              </p>
            </div>
            <Link
              href="/"
              className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-income hover:underline"
            >
              <span>View Dashboard</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        )}
      </div>

      {/* Capabilities breakdown */}
      <AvailableCapabilitiesCard
        availableCapabilities={diagnostic.availableCapabilities}
        unavailableCapabilities={diagnostic.unavailableCapabilities}
      />

      {/* Readiness checklist */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-foreground">Prerequisite Diagnostic Checklist</h3>
        <div className="grid grid-cols-1 gap-3">
          {diagnostic.items.map((item) => (
            <ReadinessItemCard key={item.key} item={item} />
          ))}
        </div>
      </div>
    </div>
  );
}
