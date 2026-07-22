"use client";

import { useMutation, useQueryClient, type UseMutationResult } from "@tanstack/react-query";
import { TransactionSchema, type CreateTransaction, type Transaction } from "@treasury-ops/shared";

import { apiClient } from "@/lib/api/client";
import { toAppError, toNetworkError } from "@/lib/api/problem";
import { qk } from "@/lib/query/keys";

type CreateTransactionRequest = CreateTransaction & Readonly<{ idempotencyKey: string }>;

export function useCreateTxn(): UseMutationResult<Transaction, Error, CreateTransactionRequest> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateTransactionRequest): Promise<Transaction> => {
      const { idempotencyKey, occurredAt } = input;
      try {
        const result = await apiClient.POST("/v1/transactions", {
          body:
            input.categoryId === undefined
              ? {
                  accountId: input.accountId,
                  type: input.type,
                  amountMinor: input.amountMinor,
                  occurredAt: occurredAt.toISOString(),
                  description: input.description,
                  tags: input.tags
                }
              : {
                  accountId: input.accountId,
                  categoryId: input.categoryId,
                  type: input.type,
                  amountMinor: input.amountMinor,
                  occurredAt: occurredAt.toISOString(),
                  description: input.description,
                  tags: input.tags
                },
          params: { header: { "Idempotency-Key": idempotencyKey } }
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
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: qk.transactionLists() });
      void queryClient.invalidateQueries({ queryKey: qk.accounts() });
      void queryClient.invalidateQueries({ queryKey: qk.netWorth() });
    }
  });
}
