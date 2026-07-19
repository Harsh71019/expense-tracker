"use client";

import { useMutation, useQueryClient, type UseMutationResult } from "@tanstack/react-query";
import { AccountSchema, type Account, type CreateAccount } from "@vyaya/shared";
import { useState } from "react";

import { apiClient } from "@/lib/api/client";
import { toAppError, toNetworkError } from "@/lib/api/problem";
import { qk } from "@/lib/query/keys";
import { generateRequestId } from "@/lib/request-id";

export function useCreateAccount(): UseMutationResult<Account, Error, CreateAccount> {
  const queryClient = useQueryClient();
  const [idempotencyKey, setIdempotencyKey] = useState(generateRequestId);
  return useMutation({
    mutationFn: async (input): Promise<Account> => {
      try {
        const result = await apiClient.POST("/v1/accounts", {
          body: input,
          params: { header: { "Idempotency-Key": idempotencyKey } }
        });
        if (result.error !== undefined) throw toAppError(result.error, result.response.status);
        const parsed = AccountSchema.safeParse(result.data);
        if (!parsed.success) throw toAppError(undefined, result.response.status);
        return parsed.data;
      } catch (error: unknown) {
        if (error instanceof Error) throw error;
        throw toNetworkError(error);
      }
    },
    onSuccess: () => {
      setIdempotencyKey(generateRequestId());
    },
    onSettled: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: qk.accounts() }),
        queryClient.invalidateQueries({ queryKey: qk.transactionLists() }),
        queryClient.invalidateQueries({ queryKey: qk.netWorth() })
      ]);
    }
  });
}
