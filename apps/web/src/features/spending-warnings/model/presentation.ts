import { formatMinor } from "@treasury-ops/shared";
import type {
  SpendingWarning,
  SpendingWarningKind,
  SpendingWarningSeverity
} from "@treasury-ops/shared";

const MS_PER_DAY = 86_400_000;

const timestampFormatter = new Intl.DateTimeFormat("en-IN", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: true,
  timeZone: "Asia/Kolkata"
});

const shortDateFormatter = new Intl.DateTimeFormat("en-IN", {
  day: "2-digit",
  month: "short",
  timeZone: "Asia/Kolkata"
});

export function formatWarningTimestamp(value: Date): string {
  return timestampFormatter.format(value);
}

export function formatShortDate(value: Date): string {
  return shortDateFormatter.format(value);
}

export function formatWindowRange(start: Date, end: Date): string {
  return `${shortDateFormatter.format(start)} – ${shortDateFormatter.format(end)}`;
}

export function windowDays(start: Date, end: Date): number {
  return Math.round((end.getTime() - start.getTime()) / MS_PER_DAY);
}

/**
 * Evidence carries `ratioBasisPoints` as integer basis points (10_000 =
 * 100%, i.e. "the same as baseline"). This only formats that integer into a
 * percent-above-baseline figure for display — it never recomputes the
 * detector's own ratio/threshold math (plan §4).
 */
export function percentAboveBaseline(ratioBasisPoints: number): number {
  return Math.round((ratioBasisPoints - 10_000) / 100);
}

export function warningKindLabel(kind: SpendingWarningKind): string {
  if (kind === "overall_spend_spike") return "Overall spike";
  if (kind === "category_spend_spike") return "Category spike";
  return "Large expense";
}

export function warningKindIcon(kind: SpendingWarningKind): string {
  if (kind === "overall_spend_spike") return "△";
  if (kind === "category_spend_spike") return "◐";
  return "◆";
}

export function severityLabel(severity: SpendingWarningSeverity): string {
  return severity === "high" ? "High variation" : "Needs attention";
}

export function warningTitle(warning: SpendingWarning): string {
  const evidence = warning.evidence;
  if (evidence.kind === "overall_spend_spike") {
    return "Overall spending spike";
  }
  if (evidence.kind === "category_spend_spike") {
    return `${evidence.categoryName ?? "Uncategorized"} spending spike`;
  }
  return `Unusually large ${evidence.categoryName ?? "uncategorized"} expense`;
}

/**
 * One-sentence, kind-specific explanation using the shared money formatter
 * (never hand-divides by 100) — mirrors the evidence examples in plan §4.
 */
export function evidenceSummary(warning: SpendingWarning): string {
  const evidence = warning.evidence;

  if (evidence.kind === "overall_spend_spike") {
    const days = windowDays(evidence.windowStart, evidence.windowEnd);
    const percent = percentAboveBaseline(evidence.ratioBasisPoints);
    return `${formatMinor(evidence.currentMinor)} in the last ${days} days, ${percent}% above your recent weekly median of ${formatMinor(evidence.baselineMedianMinor)}.`;
  }

  if (evidence.kind === "category_spend_spike") {
    const days = windowDays(evidence.windowStart, evidence.windowEnd);
    const categoryName = evidence.categoryName ?? "Uncategorized";
    return `${categoryName} was ${formatMinor(evidence.currentMinor)} in ${days} days, compared with a recent median of ${formatMinor(evidence.baselineMedianMinor)}.`;
  }

  const categoryName = evidence.categoryName ?? "this category";
  const count = evidence.baselineExpenseCount;
  return `${formatMinor(evidence.amountMinor)} is above your usual range for ${categoryName}, based on ${count} earlier expense${count === 1 ? "" : "s"}.`;
}

export type EvidenceFact =
  | Readonly<{ kind: "money"; label: string; minor: number }>
  | Readonly<{ kind: "range"; label: string; fromMinor: number; toMinor: number }>
  | Readonly<{ kind: "text"; label: string; value: string }>;

/** Structured comparison facts for the card's definition list (plan §6 — two columns on wider screens). */
export function evidenceFacts(warning: SpendingWarning): readonly EvidenceFact[] {
  const evidence = warning.evidence;

  if (evidence.kind === "overall_spend_spike") {
    const days = windowDays(evidence.windowStart, evidence.windowEnd);
    return [
      { kind: "money", label: `Last ${days} days`, minor: evidence.currentMinor },
      { kind: "money", label: "Recent weekly median", minor: evidence.baselineMedianMinor },
      {
        kind: "text",
        label: "Change",
        value: `+${percentAboveBaseline(evidence.ratioBasisPoints)}%`
      }
    ];
  }

  if (evidence.kind === "category_spend_spike") {
    const days = windowDays(evidence.windowStart, evidence.windowEnd);
    return [
      { kind: "money", label: `Last ${days} days`, minor: evidence.currentMinor },
      { kind: "money", label: "Recent median", minor: evidence.baselineMedianMinor },
      {
        kind: "text",
        label: "Change",
        value: `+${percentAboveBaseline(evidence.ratioBasisPoints)}%`
      }
    ];
  }

  return [
    { kind: "money", label: "This expense", minor: evidence.amountMinor },
    { kind: "money", label: "Usual median", minor: evidence.baselineMedianMinor },
    {
      kind: "range",
      label: "Usual range",
      fromMinor: evidence.baselineQ1Minor,
      toMinor: evidence.baselineQ3Minor
    }
  ];
}

/**
 * Investigation link targets (plan §4 "Investigation links"), built only
 * from query params the transactions route already supports:
 * `from`/`to`/`categoryId` (apps/web/src/features/transactions/model/filters.ts)
 * and the `/transactions/{transactionId}` detail route.
 */
export function investigationHref(warning: SpendingWarning): string {
  const evidence = warning.evidence;

  if (evidence.kind === "unusually_large_expense") {
    return `/transactions/${evidence.transactionId}`;
  }

  const params = new URLSearchParams();
  if (evidence.kind === "category_spend_spike" && evidence.categoryId !== undefined) {
    params.set("categoryId", evidence.categoryId);
  }
  params.set("from", evidence.windowStart.toISOString());
  params.set("to", evidence.windowEnd.toISOString());
  return `/transactions?${params.toString()}`;
}

export function investigationLinkLabel(kind: SpendingWarningKind): string {
  return kind === "unusually_large_expense" ? "Review transaction" : "Review transactions";
}
