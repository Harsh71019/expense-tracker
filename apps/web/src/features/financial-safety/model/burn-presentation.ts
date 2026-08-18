import type { EssentialBurnLimitationKey, EssentialBurnQuality } from "@treasury-ops/shared";

const monthFormatter = new Intl.DateTimeFormat("en-IN", {
  timeZone: "Asia/Kolkata",
  month: "short",
  year: "numeric"
});

/** Formats a YYYY-MM month string into e.g. "May 2026" (IST). */
export function formatMonthLabel(month: string): string {
  const parts = month.split("-");
  const year = Number(parts[0]);
  const monthNum = Number(parts[1]);
  if (isNaN(year) || isNaN(monthNum) || monthNum < 1 || monthNum > 12) {
    return month;
  }
  const date = new Date(Date.UTC(year, monthNum - 1, 1));
  return monthFormatter.format(date);
}

/** Returns the strict singular/plural phrasing for complete months. */
export function getObservedMonthsWording(observedCount: number): string {
  if (observedCount === 1) {
    return "Based on 1 complete month";
  }
  if (observedCount === 2) {
    return "Based on 2 complete months";
  }
  if (observedCount === 3) {
    return "Based on 3 complete IST months";
  }
  return "No complete month history";
}

export interface QualityBadgeConfig {
  readonly label: string;
  readonly variant: "success" | "accent" | "problem";
}

export function getQualityBadgeConfig(quality: EssentialBurnQuality): QualityBadgeConfig {
  switch (quality) {
    case "complete":
      return { label: "Ready", variant: "success" };
    case "limited":
      return { label: "Limited", variant: "accent" };
    case "unavailable":
      return { label: "Unavailable", variant: "problem" };
  }
}

export function hasClassificationLimitations(
  limitations: readonly EssentialBurnLimitationKey[]
): boolean {
  return (
    limitations.includes("uncategorized_expenses_present") ||
    limitations.includes("ungrouped_categories_present")
  );
}
