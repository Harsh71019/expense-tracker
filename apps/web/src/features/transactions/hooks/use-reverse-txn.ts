"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { TransactionSchema, type Transaction } from "@treasury-ops/shared";

import { apiClient } from "@/lib/api/client";
import { toAppError, toNetworkError } from "@/lib/api/problem";
import { qk } from "@/lib/query/keys";
import { toast } from "sonner";

export function useReverseTxn(): ReturnType<typeof useMutation<Transaction, Error, string>> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (transactionId: string): Promise<Transaction> => {
      try {
        const result = await apiClient.POST("/v1/transactions/{transactionId}/reverse", {
          params: { path: { transactionId } }
        });
        if (result.error !== undefined) {
          throw toAppError(result.error, result.response.status);
        }
        const parsed = TransactionSchema.safeParse(result.data);
        if (!parsed.success) {
          throw toAppError(undefined, result.response.status);
        }
        return parsed.data;
      } catch (error: unknown) {
        if (error instanceof Error) {
          throw error;
        }
        throw toNetworkError(error);
      }
    },
    onSuccess: (data) => {
      toast.success(`Reversal recorded: ${data.description}`);
    },
    onError: (error) => {
      toast.error(error.message || "Failed to reverse transaction");
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: qk.transactions() });
      void queryClient.invalidateQueries({ queryKey: qk.accounts() });
      void queryClient.invalidateQueries({ queryKey: qk.netWorth() });
    }
  });
}
