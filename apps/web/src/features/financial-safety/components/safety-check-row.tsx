"use client";

import type {
  FinancialAttentionLevel,
  SafetyCheck,
  SafetyCheckKey,
  SafetyCheckStatus
} from "@treasury-ops/shared";
import {
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  HelpCircle,
  Info,
  MinusCircle
} from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { Badge } from "@/components/ui/badge";
import { formatLimitationKey } from "../model/runway-presentation";
import { getSafetyActionConfig } from "../model/safety-actions";

const CHECK_TITLES: Record<SafetyCheckKey, string> = {
  term_protection: "Independent term life cover",
  health_protection: "Independent health cover",
  high_cost_debt: "High-cost debt",
  essential_burn: "Essential burn baseline",
  emergency_reserves: "Emergency reserve sources",
  emergency_runway: "Emergency runway target",
  sinking_fund_buffer: "Short-term sinking fund"
};

const SUMMARY_COPY: Record<string, string> = {
  "term_protection.not_configured": "Protection has not been configured yet.",
  "term_protection.not_applicable": "Term cover is marked not applicable, with a stated reason.",
  "term_protection.none_declared": "No term life cover is declared.",
  "term_protection.unknown": "Term cover status is not sure.",
  "term_protection.employer_only":
    "Only employer-provided cover is declared -- it doesn't count on its own.",
  "term_protection.amount_missing": "An independent cover amount has not been recorded.",
  "term_protection.expired": "The independently held term policy has expired.",
  "term_protection.income_basis_unknown":
    "An income figure is needed to evaluate the cover benchmark.",
  "term_protection.below_minimum": "Independent cover is below the 10x annual income benchmark.",
  "term_protection.expiring_soon": "Cover meets the benchmark, but the policy is expiring soon.",
  "term_protection.complete": "Independent cover meets the benchmark.",
  "health_protection.not_configured": "Protection has not been configured yet.",
  "health_protection.none_declared": "No health cover is declared.",
  "health_protection.unknown": "Health cover status is not sure.",
  "health_protection.employer_only":
    "Only employer-provided cover is declared -- it doesn't count on its own.",
  "health_protection.amount_missing": "An independent cover amount has not been recorded.",
  "health_protection.expired": "The independently held health policy has expired.",
  "health_protection.below_minimum": "Independent cover is below the ₹15,00,000 benchmark.",
  "health_protection.expiring_soon": "Cover meets the benchmark, but the policy is expiring soon.",
  "health_protection.complete": "Independent cover meets the benchmark.",
  "high_cost_debt.present": "At least one active debt is above the high-cost threshold.",
  "high_cost_debt.none": "No active high-cost debt remains.",
  "essential_burn.unavailable": "Essential burn hasn't been calculated yet.",
  "essential_burn.limited": "Essential burn is based on limited expense history.",
  "essential_burn.complete_with_uncategorized":
    "Essential burn is complete, with some uncategorized spending.",
  "essential_burn.complete": "Essential burn has a full three-month baseline.",
  "emergency_reserves.not_configured": "No account or asset is classified as an emergency reserve.",
  "emergency_reserves.configured_but_none_eligible":
    "Configured reserves exist, but none are currently eligible.",
  "emergency_reserves.stale_or_missing_present":
    "An eligible reserve has a stale or missing valuation.",
  "emergency_reserves.complete": "At least one eligible reserve source is configured.",
  "emergency_runway.unavailable": "Runway can't be calculated with the current inputs.",
  "emergency_runway.target_met": "Eligible reserves meet the current safety target.",
  "emergency_runway.below_target": "Eligible reserves are below the current safety target.",
  "sinking_fund_buffer.not_assessable": "TreasuryOps can't yet classify a short-term sinking fund."
};

function getStatusIcon(status: SafetyCheckStatus): ReactNode {
  switch (status) {
    case "complete":
      return <CheckCircle2 className="h-4 w-4 text-income" aria-hidden="true" />;
    case "incomplete":
      return <AlertCircle className="h-4 w-4 text-expense" aria-hidden="true" />;
    case "warning":
      return <AlertTriangle className="h-4 w-4 text-reversed" aria-hidden="true" />;
    case "unknown":
      return <HelpCircle className="h-4 w-4 text-accent" aria-hidden="true" />;
    case "not_applicable":
    case "not_assessable":
      return <MinusCircle className="h-4 w-4 text-foreground-muted" aria-hidden="true" />;
  }
}

function getStatusBadge(status: SafetyCheckStatus): ReactNode {
  switch (status) {
    case "complete":
      return <Badge variant="success">Complete</Badge>;
    case "incomplete":
      return <Badge variant="problem">Incomplete</Badge>;
    case "warning":
      return <Badge variant="reversed">Warning</Badge>;
    case "unknown":
      return <Badge variant="accent">Unknown</Badge>;
    case "not_applicable":
      return <Badge variant="info">Not applicable</Badge>;
    case "not_assessable":
      return <Badge variant="info">Not assessable yet</Badge>;
  }
}

function getAttentionText(attention: FinancialAttentionLevel): string | null {
  switch (attention) {
    case "blocking":
      return "Blocking";
    case "warning":
      return "Attention";
    case "information":
      return "Informational";
    case "none":
      return null;
  }
}

export interface SafetyCheckRowProps {
  readonly check: SafetyCheck;
}

/** One safety-ladder requirement row -- status is never conveyed by color alone. */
export function SafetyCheckRow({ check }: SafetyCheckRowProps): ReactNode {
  const title = CHECK_TITLES[check.key];
  const summary = SUMMARY_COPY[check.summaryKey] ?? check.summaryKey;
  const actionConfig = getSafetyActionConfig(check.action);
  const attentionText = getAttentionText(check.attention);

  return (
    <li className="rounded-xl border border-border/70 bg-surface p-3.5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2.5">
          <div
            className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-surface-muted/60"
            aria-hidden="true"
          >
            {getStatusIcon(check.status)}
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-semibold text-foreground">{title}</span>
              {getStatusBadge(check.status)}
              {attentionText !== null ? (
                <span className="inline-flex items-center gap-1 text-2xs font-semibold text-foreground-muted">
                  <Info className="h-3 w-3" aria-hidden="true" />
                  {attentionText}
                </span>
              ) : null}
            </div>
            <p className="mt-0.5 text-xs text-foreground-muted">{summary}</p>
            <span className="sr-only">
              {title}: {check.status}, {attentionText ?? "no attention needed"}. {summary}
            </span>
          </div>
        </div>

        {actionConfig ? (
          <Link
            href={actionConfig.href}
            className="inline-flex shrink-0 items-center gap-1 text-2xs font-semibold text-accent hover:underline"
          >
            <span>{actionConfig.label}</span>
            <ArrowRight className="h-3 w-3" aria-hidden="true" />
          </Link>
        ) : null}
      </div>

      {check.limitationKeys.length > 0 ? (
        <ul className="mt-2 list-disc space-y-0.5 pl-8 text-2xs text-foreground-muted">
          {check.limitationKeys.map((key) => (
            <li key={key}>{formatLimitationKey(key)}</li>
          ))}
        </ul>
      ) : null}
    </li>
  );
}
