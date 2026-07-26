import { z } from "zod";
import type { SpendingWarningKind } from "@treasury-ops/shared";

/**
 * The three list views from plan §4 — "All", "Spending spikes" (overall +
 * category together), and "Large expenses". The API's `kind` filter is a
 * single enum with no grouping of its own; see `toApiKind` below for how
 * that's reconciled without inventing an unsupported query param.
 */
export const SPENDING_WARNING_FILTER_VALUES = ["all", "spikes", "large_expenses"] as const;
const WarningFilterValueSchema = z.enum(SPENDING_WARNING_FILTER_VALUES);
export type WarningFilterValue = z.infer<typeof WarningFilterValueSchema>;

/** Matches ListSpendingWarningsQuerySchema's default (packages/shared/src/spending-warning.ts). */
export const SPENDING_WARNING_PAGE_LIMIT = 20;

export type SpendingWarningFilters = Readonly<{ filter: WarningFilterValue }>;

export type SpendingWarningSearchParams = Readonly<
  Record<string, string | readonly string[] | undefined>
>;

function getSingleValue(
  searchParams: SpendingWarningSearchParams,
  key: string
): string | undefined {
  const value = searchParams[key];
  if (typeof value === "string") {
    return value;
  }
  if (value === undefined) {
    return undefined;
  }
  return value[0];
}

/**
 * Converts untrusted route search params into list-view state. Invalid or
 * missing values fail closed to "all" rather than becoming application
 * state — same approach as transactions' filter parsing.
 */
export function parseSpendingWarningFilters(
  searchParams: SpendingWarningSearchParams
): SpendingWarningFilters {
  const raw = getSingleValue(searchParams, "filter");
  const result = raw === undefined ? undefined : WarningFilterValueSchema.safeParse(raw);
  return { filter: result?.success === true ? result.data : "all" };
}

/** Produces the canonical URL representation for a list-view filter. "all" is the default and is omitted so copied links stay compact. */
export function serializeSpendingWarningFilters(filters: SpendingWarningFilters): string {
  if (filters.filter === "all") {
    return "";
  }
  const params = new URLSearchParams();
  params.set("filter", filters.filter);
  return params.toString();
}

/**
 * `large_expenses` maps onto the one real API kind that fits it exactly.
 * `all` and `spikes` both fetch the server's unfiltered list — "spikes"
 * narrows it down to overall + category kinds on the client afterward
 * (see spending-warnings-page.tsx) rather than requesting a multi-kind
 * filter the API doesn't support.
 */
export function toApiKind(filter: WarningFilterValue): SpendingWarningKind | undefined {
  return filter === "large_expenses" ? "unusually_large_expense" : undefined;
}

/** True when a warning of `kind` should be visible under the given list-view filter. */
export function matchesWarningFilter(
  kind: SpendingWarningKind,
  filter: WarningFilterValue
): boolean {
  if (filter === "all") return true;
  if (filter === "large_expenses") return kind === "unusually_large_expense";
  return kind === "overall_spend_spike" || kind === "category_spend_spike";
}
