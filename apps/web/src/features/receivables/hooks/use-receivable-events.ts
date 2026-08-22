"use client";

import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { ReceivableEventPageSchema, type ReceivableEventPage } from "@treasury-ops/shared";

import { apiClient } from "@/lib/api/client";
import { toAppError } from "@/lib/api/problem";
import { qk } from "@/lib/query/keys";

export function useReceivableEvents(
  receivableId: string,
  initialData?: ReceivableEventPage
): UseQueryResult<ReceivableEventPage, Error> {
  return useQuery({
    queryKey: qk.receivableEvents(receivableId),
    ...(initialData === undefined ? {} : { initialData }),
    queryFn: async (): Promise<ReceivableEventPage> => {
      const result = await apiClient.GET("/v1/receivables/{receivableId}/events", {
        params: { path: { receivableId } }
      });
      if (result.error !== undefined) throw toAppError(result.error, result.response.status);
      const parsed = ReceivableEventPageSchema.safeParse(result.data);
      if (!parsed.success) throw toAppError(undefined, result.response.status);
      return parsed.data;
    }
  });
}
