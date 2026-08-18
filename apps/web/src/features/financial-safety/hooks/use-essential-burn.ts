"use client";

import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { EssentialBurnResponseSchema, type EssentialBurnResponse } from "@treasury-ops/shared";

import { apiClient } from "@/lib/api/client";
import { toAppError, toNetworkError } from "@/lib/api/problem";
import { qk } from "@/lib/query/keys";

export function useEssentialBurn(
  initialData: EssentialBurnResponse | null,
  asOf?: string
): UseQueryResult<EssentialBurnResponse | null, Error> {
  return useQuery({
    queryKey: qk.essentialBurn(asOf),
    initialData,
    queryFn: async (): Promise<EssentialBurnResponse | null> => {
      try {
        const result = await apiClient.GET("/v1/financial-safety/essential-burn", {
          params: {
            query: asOf ? { asOf } : {}
          }
        });
        if (result.error !== undefined) {
          throw toAppError(result.error, result.response.status);
        }
        const parsed = EssentialBurnResponseSchema.safeParse(result.data);
        return parsed.success ? parsed.data : null;
      } catch (error: unknown) {
        if (error instanceof Error) throw error;
        throw toNetworkError(error);
      }
    }
  });
}
