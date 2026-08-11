"use client";

import { useMutation, useQuery, useQueryClient, type UseQueryResult } from "@tanstack/react-query";
import { PendingTransactionSchema, type PendingTransaction } from "@treasury-ops/shared";
import { useState } from "react";
import { z } from "zod";

import { apiClient } from "@/lib/api/client";
import { toAppError, toNetworkError } from "@/lib/api/problem";
import { qk } from "@/lib/query/keys";
import { generateRequestId } from "@/lib/request-id";

const PendingTransactionsSchema = z.array(PendingTransactionSchema);

export function usePendingTransactions(
  initialData: PendingTransaction[]
): UseQueryResult<PendingTransaction[], Error> {
  return useQuery({
    queryKey: qk.pendingTransactions(),
    initialData,
    ...(initialData.length === 0 ? { initialDataUpdatedAt: 0 } : {}),
    queryFn: async (): Promise<PendingTransaction[]> => {
      try {
        const result = await apiClient.GET("/v1/pending-transactions", {
          params: { query: { status: "pending" } }
        });
        if (result.error !== undefined) throw toAppError(result.error, result.response.status);
        const parsed = PendingTransactionsSchema.safeParse(result.data);
        if (!parsed.success) throw toAppError(undefined, result.response.status);
        return parsed.data;
      } catch (error: unknown) {
        if (error instanceof Error) throw error;
        throw toNetworkError(error);
      }
    }
  });
}

type ConfirmVariables = Readonly<{ id: string; amountMinor: number }>;

/**
 * One instance per mounted card (mirrors useResolveRecurringReconciliation):
 * the idempotency key is scoped to this control and rotated after a
 * successful confirm, so a later action on the same card gets a fresh key.
 */
export function useConfirmPendingTransaction(): ReturnType<
  typeof useMutation<PendingTransaction, Error, ConfirmVariables>
> {
  const queryClient = useQueryClient();
  const [idempotencyKey, setIdempotencyKey] = useState(generateRequestId);

  return useMutation({
    mutationFn: async ({ id, amountMinor }): Promise<PendingTransaction> => {
      try {
        const result = await apiClient.POST("/v1/pending-transactions/{id}/confirm", {
          params: {
            path: { id },
            header: { "Idempotency-Key": idempotencyKey }
          },
          body: { amountMinor }
        });
        if (result.error !== undefined) throw toAppError(result.error, result.response.status);
        const parsed = PendingTransactionSchema.safeParse(result.data);
        if (!parsed.success) throw toAppError(undefined, result.response.status);
        return parsed.data;
      } catch (error: unknown) {
        if (error instanceof Error) throw error;
        throw toNetworkError(error);
      }
    },
    onSuccess: () => {
      setIdempotencyKey(generateRequestId());
      void queryClient.invalidateQueries({ queryKey: qk.pendingTransactions() });
    }
  });
}

export function useDismissPendingTransaction(): ReturnType<
  typeof useMutation<void, Error, string>
> {
  const queryClient = useQueryClient();
  const [idempotencyKey, setIdempotencyKey] = useState(generateRequestId);

  return useMutation({
    mutationFn: async (id: string): Promise<void> => {
      try {
        const result = await apiClient.POST("/v1/pending-transactions/{id}/dismiss", {
          params: {
            path: { id },
            header: { "Idempotency-Key": idempotencyKey }
          }
        });
        if (result.error !== undefined) throw toAppError(result.error, result.response.status);
      } catch (error: unknown) {
        if (error instanceof Error) throw error;
        throw toNetworkError(error);
      }
    },
    onSuccess: () => {
      setIdempotencyKey(generateRequestId());
      void queryClient.invalidateQueries({ queryKey: qk.pendingTransactions() });
    }
  });
}
