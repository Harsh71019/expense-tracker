"use client";

import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { NetWorthSchema, type NetWorth } from "@vyaya/shared";

import { apiClient } from "@/lib/api/client";
import { toAppError } from "@/lib/api/problem";
import { qk } from "@/lib/query/keys";

export function useNetWorth(initialData?: NetWorth): UseQueryResult<NetWorth, Error> {
  return useQuery({
    queryKey: qk.netWorth(),
    ...(initialData === undefined ? {} : { initialData }),
    queryFn: async (): Promise<NetWorth> => {
      const result = await apiClient.GET("/v1/net-worth");
      if (result.error !== undefined) throw toAppError(result.error, result.response.status);
      const parsed = NetWorthSchema.safeParse(result.data);
      if (!parsed.success) throw toAppError(undefined, result.response.status);
      return parsed.data;
    }
  });
}
