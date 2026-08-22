"use client";

import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { AssetSchema, type Asset } from "@treasury-ops/shared";

import { apiClient } from "@/lib/api/client";
import { toAppError } from "@/lib/api/problem";
import { qk } from "@/lib/query/keys";

export function useAsset(assetId: string, initialData?: Asset): UseQueryResult<Asset, Error> {
  return useQuery({
    queryKey: qk.asset(assetId),
    ...(initialData === undefined ? {} : { initialData }),
    queryFn: async (): Promise<Asset> => {
      const result = await apiClient.GET("/v1/assets/{assetId}", {
        params: { path: { assetId } }
      });
      if (result.error !== undefined) throw toAppError(result.error, result.response.status);
      const parsed = AssetSchema.safeParse(result.data);
      if (!parsed.success) throw toAppError(undefined, result.response.status);
      return parsed.data;
    }
  });
}
