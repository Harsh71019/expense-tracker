"use client";

import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { AssetFundingPageSchema, type AssetFundingPage } from "@treasury-ops/shared";

import { apiClient } from "@/lib/api/client";
import { toAppError } from "@/lib/api/problem";
import { qk } from "@/lib/query/keys";

export function useAssetFundings(assetId: string): UseQueryResult<AssetFundingPage, Error> {
  return useQuery({
    queryKey: qk.assetFundings(assetId),
    queryFn: async (): Promise<AssetFundingPage> => {
      const result = await apiClient.GET("/v1/assets/{assetId}/fundings", {
        params: { path: { assetId } }
      });
      if (result.error !== undefined) throw toAppError(result.error, result.response.status);
      const parsed = AssetFundingPageSchema.safeParse(result.data);
      if (!parsed.success) throw toAppError(undefined, result.response.status);
      return parsed.data;
    }
  });
}
