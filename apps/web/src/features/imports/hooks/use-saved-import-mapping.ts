"use client";

import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import {
  AccountIdSchema,
  AccountImportMappingSchema,
  type AccountImportMapping
} from "@vyaya/shared";

import { apiClient } from "@/lib/api/client";
import { toAppError, toNetworkError } from "@/lib/api/problem";
import { qk } from "@/lib/query/keys";

export function useSavedImportMapping(
  accountId: string
): UseQueryResult<AccountImportMapping, Error> {
  return useQuery({
    queryKey: qk.importMapping(accountId),
    enabled: AccountIdSchema.safeParse(accountId).success,
    queryFn: async (): Promise<AccountImportMapping> => {
      try {
        const result = await apiClient.GET("/v1/imports/accounts/{accountId}/mapping", {
          params: { path: { accountId } }
        });
        if (result.error !== undefined) throw toAppError(result.error, result.response.status);
        const parsed = AccountImportMappingSchema.safeParse(result.data);
        if (!parsed.success) throw toAppError(undefined, result.response.status);
        return parsed.data;
      } catch (error: unknown) {
        if (error instanceof Error) throw error;
        throw toNetworkError(error);
      }
    }
  });
}
