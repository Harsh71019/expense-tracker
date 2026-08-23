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
  const raw: Record<string, unknown> = {};
  const accountId = getSingleValue(searchParams, "accountId");
  if (accountId !== undefined) raw.accountId = accountId;
  const categoryId = getSingleValue(searchParams, "categoryId");
  if (categoryId !== undefined) raw.categoryId = categoryId;
  const uncategorized = getSingleValue(searchParams, "uncategorized");
  if (uncategorized !== undefined) raw.uncategorized = uncategorized;
  const from = getSingleValue(searchParams, "from");
  if (from !== undefined) raw.from = from;
  const to = getSingleValue(searchParams, "to");
  if (to !== undefined) raw.to = to;
  const amountMinor = getSingleValue(searchParams, "amountMinor");
  if (amountMinor !== undefined) raw.amountMinor = amountMinor;
  const minAmountMinor = getSingleValue(searchParams, "minAmountMinor");
  if (minAmountMinor !== undefined) raw.minAmountMinor = minAmountMinor;
  const maxAmountMinor = getSingleValue(searchParams, "maxAmountMinor");
  if (maxAmountMinor !== undefined) raw.maxAmountMinor = maxAmountMinor;
  const sort = getSingleValue(searchParams, "sort");
  if (sort !== undefined) raw.sort = sort;
  const q = getSingleValue(searchParams, "q");
  if (q !== undefined) raw.q = q;
  const tag = getSingleValue(searchParams, "tag");
  if (tag !== undefined) raw.tag = tag;
  const cursor = getSingleValue(searchParams, "cursor");
  if (cursor !== undefined) raw.cursor = cursor;
  const limit = getSingleValue(searchParams, "limit");
  if (limit !== undefined) raw.limit = limit;

  const result = ListTransactionsQuerySchema.safeParse(raw);

  return result.success ? result.data : { limit: 50, sort: "date_desc" };
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
  appendIfDefined(
    params,
    "amountMinor",
    filters.amountMinor !== undefined ? String(filters.amountMinor) : undefined
  );
  appendIfDefined(
    params,
    "minAmountMinor",
    filters.minAmountMinor !== undefined ? String(filters.minAmountMinor) : undefined
  );
  appendIfDefined(
    params,
    "maxAmountMinor",
    filters.maxAmountMinor !== undefined ? String(filters.maxAmountMinor) : undefined
  );
  if (filters.sort !== undefined && filters.sort !== "date_desc") {
    params.set("sort", filters.sort);
  }
  appendIfDefined(params, "q", filters.q);
  appendIfDefined(params, "tag", filters.tag);
  appendIfDefined(params, "cursor", filters.cursor);
  if (filters.limit !== 50) {
    params.set("limit", String(filters.limit));
  }

  return params.toString();
}

/**
 * Converts a user Rupees input string (e.g. "100", "100.50") into integer paise (minor units).
 * Returns undefined if invalid or empty.
 */
export function parseRupeesToMinor(val: string): number | undefined {
  const trimmed = val.trim().replace(/,/g, "");
  if (trimmed === "" || !/^\d+(\.\d{1,2})?$/.test(trimmed)) return undefined;
  const num = parseFloat(trimmed);
  if (Number.isNaN(num) || num <= 0) return undefined;
  const minor = Math.round(num * 100);
  return Number.isSafeInteger(minor) && minor > 0 ? minor : undefined;
}

/**
 * Formats minor units (paise) into a clean Rupees string for text inputs (e.g. 10000 -> "100", 10050 -> "100.50").
 */
export function minorToRupeesInput(minor: number | undefined): string {
  if (minor === undefined || minor <= 0 || !Number.isSafeInteger(minor)) return "";
  const rupees = minor / 100;
  return Number.isInteger(rupees) ? String(rupees) : rupees.toFixed(2);
}
