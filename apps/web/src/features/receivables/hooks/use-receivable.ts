"use client";

import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { ReceivableSchema, type Receivable } from "@treasury-ops/shared";

import { apiClient } from "@/lib/api/client";
import { toAppError } from "@/lib/api/problem";
import { qk } from "@/lib/query/keys";

export function useReceivable(
  receivableId: string,
  initialData?: Receivable
): UseQueryResult<Receivable, Error> {
  return useQuery({
    queryKey: qk.receivable(receivableId),
    ...(initialData === undefined ? {} : { initialData }),
    queryFn: async (): Promise<Receivable> => {
      const result = await apiClient.GET("/v1/receivables/{receivableId}", {
        params: { path: { receivableId } }
      });
      if (result.error !== undefined) throw toAppError(result.error, result.response.status);
      const parsed = ReceivableSchema.safeParse(result.data);
      if (!parsed.success) throw toAppError(undefined, result.response.status);
      return parsed.data;
    }
  });
}
