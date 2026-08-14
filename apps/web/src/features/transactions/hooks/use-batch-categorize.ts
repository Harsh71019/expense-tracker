"use client";

import { useMutation, useQueryClient, type UseMutationResult } from "@tanstack/react-query";
import {
  BatchCategorizeTransactionsResultSchema,
  type BatchCategorizeTransactions,
  type BatchCategorizeTransactionsResult
} from "@treasury-ops/shared";
import { useState } from "react";

import { apiClient } from "@/lib/api/client";
import { toAppError, toNetworkError } from "@/lib/api/problem";
import { qk } from "@/lib/query/keys";
import { generateRequestId } from "@/lib/request-id";

export function useBatchCategorize(): UseMutationResult<
  BatchCategorizeTransactionsResult,
  Error,
  BatchCategorizeTransactions
> {
  const client = useQueryClient();
  const [key, setKey] = useState(generateRequestId);

  return useMutation({
    mutationFn: async (input): Promise<BatchCategorizeTransactionsResult> => {
      try {
        const result = await apiClient.PATCH("/v1/transactions", {
          body: input,
          params: { header: { "Idempotency-Key": key } }
        });
        if (result.error !== undefined) throw toAppError(result.error, result.response.status);
        const parsed = BatchCategorizeTransactionsResultSchema.safeParse(result.data);
        if (!parsed.success) throw toAppError(undefined, result.response.status);
        return parsed.data;
      } catch (error: unknown) {
        if (error instanceof Error) throw error;
        throw toNetworkError(error);
      }
    },
    onSuccess: () => {
      setKey(generateRequestId());
    },
    onSettled: async () => {
      await Promise.all([
        client.invalidateQueries({ queryKey: qk.transactions() }),
        client.invalidateQueries({ queryKey: qk.budgets() }),
        client.invalidateQueries({ queryKey: qk.dashboard() }),
        client.invalidateQueries({ queryKey: qk.monthlyRollups() })
      ]);
    }
  });
}
