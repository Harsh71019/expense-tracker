"use client";

import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { AccountSchema, type Account } from "@vyaya/shared";
import { z } from "zod";

import { apiClient } from "@/lib/api/client";
import { toAppError, toNetworkError } from "@/lib/api/problem";
import { qk } from "@/lib/query/keys";

const AccountsSchema = z.array(AccountSchema);

export function useAccounts(initialData?: Account[]): UseQueryResult<Account[], Error> {
  return useQuery({
    queryKey: qk.accounts(),
    ...(initialData === undefined ? {} : { initialData }),
    queryFn: async (): Promise<Account[]> => {
      try {
        const result = await apiClient.GET("/v1/accounts");
        if (result.error !== undefined) throw toAppError(result.error, result.response.status);
        const parsed = AccountsSchema.safeParse(result.data);
        if (!parsed.success) throw toAppError(undefined, result.response.status);
        return parsed.data;
      } catch (error: unknown) {
        if (error instanceof Error) throw error;
        throw toNetworkError(error);
      }
    }
  });
}
