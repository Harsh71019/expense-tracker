"use client";

import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { ValuationPageSchema, type ValuationPage } from "@treasury-ops/shared";

import { apiClient } from "@/lib/api/client";
import { toAppError } from "@/lib/api/problem";
import { qk } from "@/lib/query/keys";

export function useValuations(
  assetId: string,
  initialData?: ValuationPage
): UseQueryResult<ValuationPage, Error> {
  return useQuery({
    queryKey: qk.assetValuations(assetId),
    ...(initialData === undefined ? {} : { initialData }),
    queryFn: async (): Promise<ValuationPage> => {
      const result = await apiClient.GET("/v1/assets/{assetId}/valuations", {
        params: { path: { assetId } }
      });
      if (result.error !== undefined) throw toAppError(result.error, result.response.status);
      const parsed = ValuationPageSchema.safeParse(result.data);
      if (!parsed.success) throw toAppError(undefined, result.response.status);
      return parsed.data;
    }
  });
}
