"use client";

import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { BillPageSchema, type CreditCardBill } from "@treasury-ops/shared";

import { apiClient } from "@/lib/api/client";
import { toAppError, toNetworkError } from "@/lib/api/problem";
import { qk } from "@/lib/query/keys";

const OPEN_BILLS_QUERY = { limit: 200 };

export function useOpenBills(): UseQueryResult<CreditCardBill[], Error> {
  return useQuery({
    queryKey: qk.billList(OPEN_BILLS_QUERY),
    queryFn: async (): Promise<CreditCardBill[]> => {
      try {
        const result = await apiClient.GET("/v1/bills", { params: { query: OPEN_BILLS_QUERY } });
        if (result.error !== undefined) throw toAppError(result.error, result.response.status);
        const parsed = BillPageSchema.safeParse(result.data);
        if (!parsed.success) throw toAppError(undefined, result.response.status);
        return parsed.data.items.filter((bill) => bill.remainingMinor > 0);
      } catch (error: unknown) {
        if (error instanceof Error) throw error;
        throw toNetworkError(error);
      }
    }
  });
}
