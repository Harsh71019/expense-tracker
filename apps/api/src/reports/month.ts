import type { Month } from "@vyaya/shared";

/** "2026-01" -> "2025-12"; plain calendar-month arithmetic on the YYYY-MM key itself. */
export function previousMonth(month: Month): Month {
  const [yearPart, monthPart] = month.split("-");
  const year = Number(yearPart);
  const monthIndex = Number(monthPart) - 1;
  const previous = new Date(Date.UTC(year, monthIndex - 1, 1));
  return `${previous.getUTCFullYear()}-${String(previous.getUTCMonth() + 1).padStart(2, "0")}`;
}
