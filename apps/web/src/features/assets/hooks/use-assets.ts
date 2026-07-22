"use client";

import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { AssetSchema, type Asset } from "@treasury-ops/shared";
import { z } from "zod";

import { apiClient } from "@/lib/api/client";
import { toAppError } from "@/lib/api/problem";
import { qk } from "@/lib/query/keys";

const AssetsSchema = z.array(AssetSchema);

export function useAssets(initialData: Asset[]): UseQueryResult<Asset[], Error> {
  return useQuery({
    queryKey: qk.assets(),
    initialData,
    queryFn: async (): Promise<Asset[]> => {
      const result = await apiClient.GET("/v1/assets");
      if (result.error !== undefined) throw toAppError(result.error, result.response.status);
      const parsed = AssetsSchema.safeParse(result.data);
      if (!parsed.success) throw toAppError(undefined, result.response.status);
      return parsed.data;
    }
  });
}
