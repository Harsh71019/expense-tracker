"use client";

import type {
  FinancialAttentionLevel,
  FinancialDiagnosticKey,
  FinancialReadinessItem,
  FinancialReadinessStatus
} from "@treasury-ops/shared";
import {
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Clock,
  HelpCircle,
  Info
} from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { Badge } from "@/components/ui/badge";
import { getDiagnosticActionConfig } from "../model/diagnostic-actions";

const ITEM_TITLES: Record<FinancialDiagnosticKey, string> = {
  salary: "Salary & Net Income",
  work_schedule: "Working Hours & Schedule",
  accounts: "Bank & Cash Accounts",
  essential_categories: "Essential Categories",
  burn_history: "3-Month Burn Baseline",
  protection: "Life & Health Protection",
  debt_inventory: "Debt & Liability Inventory",
  safety_buffer: "Emergency Safety Buffer",
  assets: "Asset Holdings",
  asset_valuations: "Asset Valuations",
  goals: "Financial Goals"
};

const ITEM_DESCRIPTIONS: Record<FinancialDiagnosticKey, string> = {
  salary: "Effective net monthly salary needed for savings rate and planning.",
  work_schedule: "Monthly work hours required to calculate your true life-hour rate.",
  accounts: "At least one non-credit-card account to track real liquid reserves.",
  essential_categories: "Classified non-negotiable living expenses (rent, food, utilities).",
  burn_history: "3 complete calendar months of essential expenses to establish burn.",
  protection: "Independent and employer term life and health insurance covers.",
  debt_inventory: "Active loans and credit balances to identify high-cost debt.",
  safety_buffer: "Configured emergency buffer reserve policy and targets.",
  assets: "Investments, fixed deposits, gold, and properties owned.",
  asset_valuations: "Up-to-date valuations reflecting true current net worth.",
  goals: "Target amounts and deadlines for upcoming financial milestones."
};

function getStatusBadge(status: FinancialReadinessStatus): ReactNode {
  switch (status) {
    case "ready":
      return <Badge variant="success">Ready</Badge>;
    case "estimated":
      return <Badge variant="accent">Estimated</Badge>;
    case "limited":
      return <Badge variant="pending">Limited</Badge>;
    case "stale":
      return <Badge variant="problem">Stale</Badge>;
    case "missing":
      return <Badge variant="problem">Missing</Badge>;
  }
}

function getAttentionBadge(attention: FinancialAttentionLevel): ReactNode {
  switch (attention) {
    case "blocking":
      return (
        <span className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 font-mono text-2xs font-semibold text-expense bg-expense/10">
          <AlertCircle className="h-3 w-3" />
          Blocking
        </span>
      );
    case "warning":
      return (
        <span className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 font-mono text-2xs font-semibold text-reversed bg-reversed/10">
          <AlertTriangle className="h-3 w-3" />
          Attention
        </span>
      );
    case "information":
      return (
        <span className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 font-mono text-2xs font-semibold text-foreground-muted bg-surface-muted">
          <Info className="h-3 w-3" />
          Optional
        </span>
      );
    case "none":
      return null;
  }
}

function getStatusIcon(status: FinancialReadinessStatus): ReactNode {
  switch (status) {
    case "ready":
      return <CheckCircle2 className="h-4 w-4 text-income" />;
    case "estimated":
      return <HelpCircle className="h-4 w-4 text-accent" />;
    case "limited":
      return <Clock className="h-4 w-4 text-foreground-muted" />;
    case "stale":
      return <AlertTriangle className="h-4 w-4 text-reversed" />;
    case "missing":
      return <AlertCircle className="h-4 w-4 text-expense" />;
  }
}

export function ReadinessItemCard({
  item
}: Readonly<{
  item: FinancialReadinessItem;
}>): ReactNode {
  const actionConfig = getDiagnosticActionConfig(item.action);
  const title = ITEM_TITLES[item.key] ?? item.key;
  const description = ITEM_DESCRIPTIONS[item.key] ?? "";

  return (
    <div className="rounded-xl border border-border/70 bg-surface p-4 transition-all hover:border-border">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-surface-muted/60">
            {getStatusIcon(item.status)}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h4 className="text-sm font-semibold text-foreground">{title}</h4>
              {getStatusBadge(item.status)}
              {getAttentionBadge(item.attention)}
            </div>
            <p className="mt-0.5 text-xs text-foreground-muted">{description}</p>
          </div>
        </div>

        {actionConfig ? (
          <Link
            href={actionConfig.href}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-border bg-surface-elevated px-3 py-1.5 text-xs font-semibold text-foreground transition-colors hover:border-accent/50 hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            <span>{actionConfig.label}</span>
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        ) : null}
      </div>

      {item.limitationKeys.length > 0 ? (
        <div className="mt-3 rounded-lg border border-border/50 bg-surface-muted/30 p-2.5 text-xs text-foreground-muted">
          <div className="flex items-center gap-1.5 font-medium text-foreground-muted">
            <Info className="h-3.5 w-3.5" />
            <span>Limitations & Assumptions:</span>
          </div>
          <ul className="mt-1 list-disc pl-4 space-y-0.5 text-2xs">
            {item.limitationKeys.map((key) => (
              <li key={key}>{key}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
