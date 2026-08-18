"use client";

import type { FinancialDiagnostic, FinancialReadinessStatus } from "@treasury-ops/shared";
import { ArrowRight, ShieldCheck } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { Badge } from "@/components/ui/badge";
import { useFinancialDiagnostic } from "../hooks/use-financial-diagnostic";
import { getDiagnosticActionConfig } from "../model/diagnostic-actions";

export interface DataReadinessPanelProps {
  readonly initialDiagnostic: FinancialDiagnostic | null;
  readonly className?: string;
}

function getStatusMiniDot(status: FinancialReadinessStatus): ReactNode {
  switch (status) {
    case "ready":
      return <span className="h-2 w-2 rounded-full bg-income" title="Ready" />;
    case "estimated":
      return <span className="h-2 w-2 rounded-full bg-accent" title="Estimated" />;
    case "limited":
      return <span className="h-2 w-2 rounded-full bg-foreground-muted" title="Limited" />;
    case "stale":
      return <span className="h-2 w-2 rounded-full bg-reversed" title="Stale" />;
    case "missing":
      return <span className="h-2 w-2 rounded-full bg-expense" title="Missing" />;
  }
}

export function DataReadinessPanel({
  initialDiagnostic,
  className = ""
}: DataReadinessPanelProps): ReactNode {
  const { data: diagnostic } = useFinancialDiagnostic(initialDiagnostic);

  if (!diagnostic) return null;

  const nextActionConfig = getDiagnosticActionConfig(diagnostic.nextAction);

  const getOverallBadge = () => {
    switch (diagnostic.overallStatus) {
      case "ready":
        return <Badge variant="success">Ready</Badge>;
      case "limited":
        return <Badge variant="accent">Partial</Badge>;
      case "setup_required":
        return <Badge variant="problem">Setup Required</Badge>;
    }
  };

  return (
    <div
      className={[
        "rounded-2xl border border-border/80 bg-surface p-5 shadow-sm transition-all",
        className
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent/10 text-accent">
            <ShieldCheck className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-foreground">Copilot Data Readiness</h3>
              {getOverallBadge()}
            </div>
            <p className="text-xs text-foreground-muted">
              {diagnostic.readyCount} of {diagnostic.totalRequiredCount} core prerequisites ready •{" "}
              {diagnostic.availableCapabilities.length} capabilities unlocked
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {nextActionConfig ? (
            <Link
              href={nextActionConfig.href}
              className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-accent-foreground shadow-sm transition-all hover:bg-accent-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              <span>{nextActionConfig.label}</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          ) : null}

          <Link
            href="/onboarding"
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface-elevated px-3 py-1.5 text-xs font-semibold text-foreground transition-colors hover:border-accent/50 hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            <span>Full Diagnostic</span>
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </div>

      {/* Mini status indicator row */}
      <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-border/50 pt-3">
        {diagnostic.items.map((item) => (
          <div key={item.key} className="flex items-center gap-1.5 text-2xs text-foreground-muted">
            {getStatusMiniDot(item.status)}
            <span className="capitalize">{item.key.replace(/_/g, " ")}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
