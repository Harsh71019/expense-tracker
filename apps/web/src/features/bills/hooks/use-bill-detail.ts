"use client";

import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { BillDetailSchema, type BillDetail } from "@treasury-ops/shared";

import { apiClient } from "@/lib/api/client";
import { toAppError, toNetworkError } from "@/lib/api/problem";
import { qk } from "@/lib/query/keys";

export function useBillDetail(
  billId: string,
  initialData: BillDetail
): UseQueryResult<BillDetail, Error> {
  return useQuery({
    queryKey: qk.billDetail(billId),
    initialData,
    queryFn: async (): Promise<BillDetail> => {
      try {
        const result = await apiClient.GET("/v1/bills/{billId}", {
          params: { path: { billId } }
        });
        if (result.error !== undefined) throw toAppError(result.error, result.response.status);
        const parsed = BillDetailSchema.safeParse(result.data);
        if (!parsed.success) throw toAppError(undefined, result.response.status);
        return parsed.data;
      } catch (error: unknown) {
        if (error instanceof Error) throw error;
        throw toNetworkError(error);
      }
    },
    refetchInterval: (query) =>
      query.state.data?.activeStatement?.status === "pending" ? 2_000 : false
  });
}
