import { ListBillsQuerySchema, type ListBillsQuery } from "@treasury-ops/shared";

export type BillSearchParams = Readonly<Record<string, string | readonly string[] | undefined>>;

function single(params: BillSearchParams, key: string): string | undefined {
  const value = params[key];
  return typeof value === "string" ? value : value?.[0];
}

export function parseBillFilters(params: BillSearchParams): ListBillsQuery {
  const parsed = ListBillsQuerySchema.safeParse({
    accountId: single(params, "accountId"),
    reconciliationStatus: single(params, "reconciliationStatus"),
    paymentStatus: single(params, "paymentStatus"),
    cursor: single(params, "cursor"),
    limit: single(params, "limit")
  });
  return parsed.success ? parsed.data : { limit: 50 };
}

export function serializeBillFilters(filters: ListBillsQuery): string {
  const params = new URLSearchParams();
  if (filters.accountId !== undefined) params.set("accountId", filters.accountId);
  if (filters.reconciliationStatus !== undefined) {
    params.set("reconciliationStatus", filters.reconciliationStatus);
  }
  if (filters.paymentStatus !== undefined) params.set("paymentStatus", filters.paymentStatus);
  if (filters.cursor !== undefined) params.set("cursor", filters.cursor);
  if (filters.limit !== 50) params.set("limit", String(filters.limit));
  return params.toString();
}
