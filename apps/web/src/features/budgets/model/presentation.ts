import { formatMinor, type BudgetProgress, type BudgetProgressState } from "@treasury-ops/shared";

const INDIA_OFFSET = "+05:30";

const statusLabels: Record<BudgetProgressState, string> = {
  under: "On track",
  approaching: "Approaching limit",
  reached: "Limit reached"
};

export function budgetStatusLabel(state: BudgetProgressState): string {
  return statusLabels[state];
}

export function utilizationPercent(utilizationBps: number): number {
  return Math.floor(utilizationBps / 100);
}

export function clampedMeterPercent(utilizationBps: number): number {
  return Math.min(100, utilizationPercent(utilizationBps));
}

export function budgetAmountLabel(progress: BudgetProgress): string {
  return progress.remainingMinor >= 0
    ? `${formatMinor(progress.remainingMinor)} remaining`
    : `${formatMinor(Math.abs(progress.remainingMinor))} over`;
}

export function budgetMeterValueText(progress: BudgetProgress): string {
  return `${formatMinor(progress.spentMinor)} spent of ${formatMinor(progress.budget.limitMinor)}; ${budgetAmountLabel(progress)}.`;
}

export function monthLabel(month: string): string {
  return new Intl.DateTimeFormat("en-IN", {
    month: "long",
    year: "numeric",
    timeZone: "Asia/Kolkata"
  }).format(new Date(`${month}-01T00:00:00${INDIA_OFFSET}`));
}

function nextMonth(month: string): string {
  const [yearText, monthText] = month.split("-");
  const year = Number(yearText);
  const monthNumber = Number(monthText);
  if (!Number.isInteger(year) || !Number.isInteger(monthNumber)) {
    return month;
  }
  const nextYear = monthNumber === 12 ? year + 1 : year;
  const nextMonthNumber = monthNumber === 12 ? 1 : monthNumber + 1;
  return `${nextYear.toString().padStart(4, "0")}-${nextMonthNumber.toString().padStart(2, "0")}`;
}

export function budgetTransactionsHref(categoryId: string, month: string): string {
  const start = new Date(`${month}-01T00:00:00${INDIA_OFFSET}`);
  const endExclusive = new Date(`${nextMonth(month)}-01T00:00:00${INDIA_OFFSET}`);
  const endInclusive = new Date(endExclusive.getTime() - 1);
  const params = new URLSearchParams({
    categoryId,
    from: start.toISOString(),
    to: endInclusive.toISOString()
  });
  return `/transactions?${params.toString()}`;
}
