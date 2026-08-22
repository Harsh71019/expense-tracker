"use client";

import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import {
  ReceivablePageSchema,
  type ListReceivablesQuery,
  type ReceivablePage
} from "@treasury-ops/shared";

import { apiClient } from "@/lib/api/client";
import { toAppError } from "@/lib/api/problem";
import { qk } from "@/lib/query/keys";

export function useReceivables(
  query: ListReceivablesQuery,
  initialData?: ReceivablePage
): UseQueryResult<ReceivablePage, Error> {
  return useQuery({
    queryKey: qk.receivableList(query),
    ...(initialData === undefined ? {} : { initialData }),
    queryFn: async (): Promise<ReceivablePage> => {
      const result = await apiClient.GET("/v1/receivables", {
        params: {
          query: {
            status: query.status,
            limit: query.limit,
            ...(query.cursor === undefined ? {} : { cursor: query.cursor })
          }
        }
      });
      if (result.error !== undefined) throw toAppError(result.error, result.response.status);
      const parsed = ReceivablePageSchema.safeParse(result.data);
      if (!parsed.success) throw toAppError(undefined, result.response.status);
      return parsed.data;
    }
  });
}
