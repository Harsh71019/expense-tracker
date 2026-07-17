"use client";

import { useMutation, useQueryClient, type UseMutationResult } from "@tanstack/react-query";
import { useState } from "react";

import { apiClient } from "@/lib/api/client";
import { toAppError, toNetworkError } from "@/lib/api/problem";
import { qk } from "@/lib/query/keys";
import { generateRequestId } from "@/lib/request-id";

export function useArchiveAccount(): UseMutationResult<void, Error, string> {
  const queryClient = useQueryClient();
  const [idempotencyKey, setIdempotencyKey] = useState(generateRequestId);
  return useMutation({
    mutationFn: async (accountId): Promise<void> => {
      try {
        const result = await apiClient.PATCH("/v1/accounts/{accountId}/archive", {
          params: {
            path: { accountId },
            header: { "Idempotency-Key": idempotencyKey }
          }
        });
        if (result.error !== undefined) throw toAppError(result.error, result.response.status);
      } catch (error: unknown) {
        if (error instanceof Error) throw error;
        throw toNetworkError(error);
      }
    },
    onSuccess: async () => {
      setIdempotencyKey(generateRequestId());
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: qk.accounts() }),
        queryClient.invalidateQueries({ queryKey: ["txns"] }),
        queryClient.invalidateQueries({ queryKey: qk.netWorth() })
      ]);
    }
  });
}
