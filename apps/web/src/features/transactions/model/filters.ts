import { ListTransactionsQuerySchema, type ListTransactionsQuery } from "@treasury-ops/shared";

export type TransactionSearchParams = Readonly<
  Record<string, string | readonly string[] | undefined>
>;

function getSingleValue(searchParams: TransactionSearchParams, key: string): string | undefined {
  const value = searchParams[key];
  if (typeof value === "string") {
    return value;
  }

  if (value === undefined) {
    return undefined;
  }

  return value[0];
}

function appendIfDefined(params: URLSearchParams, key: string, value: string | undefined): void {
  if (value !== undefined) {
    params.set(key, value);
  }
}

/**
 * Converts untrusted route search params into the single transaction-list state
 * used by server renders and future client interactions. Invalid URLs fail
 * closed to the canonical default list instead of becoming application state.
 */
export function parseTransactionFilters(
  searchParams: TransactionSearchParams
): ListTransactionsQuery {
  const result = ListTransactionsQuerySchema.safeParse({
    accountId: getSingleValue(searchParams, "accountId"),
    categoryId: getSingleValue(searchParams, "categoryId"),
    uncategorized: getSingleValue(searchParams, "uncategorized"),
    from: getSingleValue(searchParams, "from"),
    to: getSingleValue(searchParams, "to"),
    q: getSingleValue(searchParams, "q"),
    tag: getSingleValue(searchParams, "tag"),
    cursor: getSingleValue(searchParams, "cursor"),
    limit: getSingleValue(searchParams, "limit")
  });

  return result.success ? result.data : { limit: 50 };
}

const IST_TIME_ZONE = "Asia/Kolkata";

const istDateFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: IST_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit"
});

/**
 * Returns a date string formatted as YYYY-MM-DD in Asia/Kolkata (IST),
 * or an empty string if undefined or invalid.
 */
export function toISTDateInputValue(value: Date | undefined): string {
  if (value === undefined || Number.isNaN(value.getTime())) {
    return "";
  }
  return istDateFormatter.format(value);
}

/**
 * Returns a UTC Date representing 00:00:00.000 in Asia/Kolkata (+05:30) for the given YYYY-MM-DD string.
 * Returns undefined if value is empty or invalid.
 */
export function startOfISTDay(value: string): Date | undefined {
  const trimmed = value.trim();
  if (trimmed === "") return undefined;
  const d = new Date(`${trimmed}T00:00:00.000+05:30`);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

/**
 * Returns a UTC Date representing 23:59:59.999 in Asia/Kolkata (+05:30) for the given YYYY-MM-DD string.
 * Returns undefined if value is empty or invalid.
 */
export function endOfISTDay(value: string): Date | undefined {
  const trimmed = value.trim();
  if (trimmed === "") return undefined;
  const d = new Date(`${trimmed}T23:59:59.999+05:30`);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

/**
 * Checks if two dates fall on the exact same Asia/Kolkata calendar day.
 */
export function isSameISTDay(a: Date | undefined, b: Date | undefined): boolean {
  if (a === undefined || b === undefined) return false;
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return false;
  return toISTDateInputValue(a) === toISTDateInputValue(b);
}

/**
 * Produces the canonical URL representation for transaction list state. The
 * default page size is intentionally omitted so copied links stay compact.
 */
export function serializeTransactionFilters(filters: ListTransactionsQuery): string {
  const params = new URLSearchParams();
  appendIfDefined(params, "accountId", filters.accountId);
  appendIfDefined(params, "categoryId", filters.categoryId);
  if (filters.uncategorized === true) {
    params.set("uncategorized", "true");
  }
  appendIfDefined(params, "from", filters.from?.toISOString());
  appendIfDefined(params, "to", filters.to?.toISOString());
  appendIfDefined(params, "q", filters.q);
  appendIfDefined(params, "tag", filters.tag);
  appendIfDefined(params, "cursor", filters.cursor);
  if (filters.limit !== 50) {
    params.set("limit", String(filters.limit));
  }

  return params.toString();
}
