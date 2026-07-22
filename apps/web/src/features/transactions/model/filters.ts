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
    from: getSingleValue(searchParams, "from"),
    to: getSingleValue(searchParams, "to"),
    q: getSingleValue(searchParams, "q"),
    cursor: getSingleValue(searchParams, "cursor"),
    limit: getSingleValue(searchParams, "limit")
  });

  return result.success ? result.data : { limit: 50 };
}

/**
 * Produces the canonical URL representation for transaction list state. The
 * default page size is intentionally omitted so copied links stay compact.
 */
export function serializeTransactionFilters(filters: ListTransactionsQuery): string {
  const params = new URLSearchParams();
  appendIfDefined(params, "accountId", filters.accountId);
  appendIfDefined(params, "categoryId", filters.categoryId);
  appendIfDefined(params, "from", filters.from?.toISOString());
  appendIfDefined(params, "to", filters.to?.toISOString());
  appendIfDefined(params, "q", filters.q);
  appendIfDefined(params, "cursor", filters.cursor);
  if (filters.limit !== 50) {
    params.set("limit", String(filters.limit));
  }

  return params.toString();
}
