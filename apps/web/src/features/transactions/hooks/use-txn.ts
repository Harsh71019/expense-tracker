"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { TransactionSchema, type Transaction, type UpdateTransaction } from "@vyaya/shared";
import { useState } from "react";

import { apiClient } from "@/lib/api/client";
import { toAppError, toNetworkError } from "@/lib/api/problem";
import { qk } from "@/lib/query/keys";
import { generateRequestId } from "@/lib/request-id";

export function useTxn(
  transactionId: string,
  initialData: Transaction
): ReturnType<typeof useQuery<Transaction, Error>> {
  return useQuery({
    queryKey: qk.txn(transactionId),
    initialData,
    queryFn: async (): Promise<Transaction> => {
      const result = await apiClient.GET("/v1/transactions/{transactionId}", {
        params: { path: { transactionId } }
      });
      if (result.error !== undefined) throw toAppError(result.error, result.response.status);
      const parsed = TransactionSchema.safeParse(result.data);
      if (!parsed.success) throw toAppError(undefined, result.response.status);
      return parsed.data;
    }
  });
}

type UpdateRequest = Readonly<{ transactionId: string; patch: UpdateTransaction }>;

export function useUpdateTxn(): ReturnType<typeof useMutation<Transaction, Error, UpdateRequest>> {
  const client = useQueryClient();
  const [key, setKey] = useState(generateRequestId);
  return useMutation({
    mutationFn: async ({ transactionId, patch }): Promise<Transaction> => {
      try {
        const result = await apiClient.PATCH("/v1/transactions/{transactionId}", {
          body: {
            ...(patch.description === undefined ? {} : { description: patch.description }),
            ...(patch.tags === undefined ? {} : { tags: patch.tags }),
            ...(patch.categoryId === undefined ? {} : { categoryId: patch.categoryId })
          },
          params: { path: { transactionId }, header: { "Idempotency-Key": key } }
        });
        if (result.error !== undefined) throw toAppError(result.error, result.response.status);
        const parsed = TransactionSchema.safeParse(result.data);
        if (!parsed.success) throw toAppError(undefined, result.response.status);
        return parsed.data;
      } catch (error: unknown) {
        if (error instanceof Error) throw error;
        throw toNetworkError(error);
      }
    },
    onSuccess: async (transaction) => {
      setKey(generateRequestId());
      client.setQueryData(qk.txn(transaction.id), transaction);
      await client.invalidateQueries({ queryKey: ["txns"] });
    }
  });
}
