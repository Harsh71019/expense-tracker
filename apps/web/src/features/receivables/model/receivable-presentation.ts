import type { ReceivableEventKind, ReceivableStatus } from "@treasury-ops/shared";

export const RECEIVABLE_STATUS_LABEL: Record<ReceivableStatus, string> = {
  active: "Active",
  settled: "Settled",
  cancelled: "Cancelled"
};

export const RECEIVABLE_STATUS_BADGE_VARIANT: Record<
  ReceivableStatus,
  "accent" | "success" | "info"
> = {
  active: "accent",
  settled: "success",
  cancelled: "info"
};

/**
 * A `legacy_decrease` is an imported valuation delta, not proof a repayment
 * was actually received — never surface it as a confirmed repayment.
 */
export function receivableEventLabel(kind: ReceivableEventKind): string {
  switch (kind) {
    case "opening":
      return "Lent / opening balance";
    case "repayment":
      return "Partial repayment";
    case "correction_increase":
      return "Balance correction (increase)";
    case "correction_decrease":
      return "Balance correction (decrease)";
    case "legacy_increase":
    case "legacy_decrease":
      return "Imported balance adjustment";
  }
}

export function isLegacyEvent(kind: ReceivableEventKind): boolean {
  return kind === "legacy_increase" || kind === "legacy_decrease";
}

export function isIncreaseEvent(kind: ReceivableEventKind): boolean {
  return kind === "opening" || kind === "correction_increase" || kind === "legacy_increase";
}

export function dueState(
  dueAt: Date | undefined,
  status: ReceivableStatus,
  now: Date = new Date()
): "none" | "upcoming" | "overdue" {
  if (dueAt === undefined || status !== "active") return "none";
  return dueAt.getTime() < now.getTime() ? "overdue" : "upcoming";
}
