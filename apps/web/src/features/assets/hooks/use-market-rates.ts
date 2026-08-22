"use client";

import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { MarketRatesSchema, type MarketRates } from "@treasury-ops/shared";

import { apiClient } from "@/lib/api/client";
import { toAppError } from "@/lib/api/problem";
import { qk } from "@/lib/query/keys";

export function useMarketRates(
  initialData?: MarketRates | null
): UseQueryResult<MarketRates, Error> {
  return useQuery({
    queryKey: qk.marketRates(),
    ...(initialData ? { initialData } : {}),
    queryFn: async (): Promise<MarketRates> => {
      const result = await apiClient.GET("/v1/assets/market-rates");
      if (result.error !== undefined) throw toAppError(result.error, result.response.status);
      const parsed = MarketRatesSchema.safeParse(result.data);
      if (!parsed.success) throw toAppError(undefined, result.response.status);
      return parsed.data;
    },
    staleTime: 5 * 60 * 1000 // 5 minutes
  });
}
