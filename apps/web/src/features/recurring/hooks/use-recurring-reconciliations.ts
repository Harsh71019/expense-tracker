"use client";

import { useMutation, useQuery, useQueryClient, type UseQueryResult } from "@tanstack/react-query";
import {
  RecurringReconciliationReviewItemSchema,
  RecurringReconciliationSchema,
  type RecurringReconciliation,
  type RecurringReconciliationResolution,
  type RecurringReconciliationReviewItem
} from "@treasury-ops/shared";
import { useState } from "react";
import { z } from "zod";

import { apiClient } from "@/lib/api/client";
import { toAppError, toNetworkError } from "@/lib/api/problem";
import { qk } from "@/lib/query/keys";
import { generateRequestId } from "@/lib/request-id";

const RecurringReconciliationsSchema = z.array(RecurringReconciliationReviewItemSchema);

export function useRecurringReconciliations(
  initialData: RecurringReconciliationReviewItem[]
): UseQueryResult<RecurringReconciliationReviewItem[], Error> {
  return useQuery({
    queryKey: qk.recurringReconciliations(),
    initialData,
    ...(initialData.length === 0 ? { initialDataUpdatedAt: 0 } : {}),
    queryFn: async (): Promise<RecurringReconciliationReviewItem[]> => {
      try {
        const result = await apiClient.GET("/v1/recurring/reconciliations", {
          params: { query: { status: "pending" } }
        });
        if (result.error !== undefined) throw toAppError(result.error, result.response.status);
        const parsed = RecurringReconciliationsSchema.safeParse(result.data);
        if (!parsed.success) throw toAppError(undefined, result.response.status);
        return parsed.data;
      } catch (error: unknown) {
        if (error instanceof Error) throw error;
        throw toNetworkError(error);
      }
    }
  });
}

type ResolveVariables = Readonly<{
  id: string;
  resolution: RecurringReconciliationResolution;
  chosenRecurringTransactionId?: string;
}>;

/**
 * One instance per mounted review card (mirrors
 * useDismissSpendingWarning): the idempotency key is scoped to this
 * control, generated on mount, and rotated after a successful resolve so a
 * later action on the same card gets a fresh key. Call this once per card,
 * not once at the list level, or a retry on one card could replay another
 * card's cached response.
 */
export function useResolveRecurringReconciliation(): ReturnType<
  typeof useMutation<RecurringReconciliation, Error, ResolveVariables>
> {
  const queryClient = useQueryClient();
  const [idempotencyKey, setIdempotencyKey] = useState(generateRequestId);

  return useMutation({
    mutationFn: async ({
      id,
      resolution,
      chosenRecurringTransactionId
    }): Promise<RecurringReconciliation> => {
      try {
        const result = await apiClient.POST("/v1/recurring/reconciliations/{id}/resolve", {
          params: {
            path: { id },
            header: { "Idempotency-Key": idempotencyKey }
          },
          body: {
            resolution,
            ...(chosenRecurringTransactionId === undefined ? {} : { chosenRecurringTransactionId })
          }
        });
        if (result.error !== undefined) throw toAppError(result.error, result.response.status);
        const parsed = RecurringReconciliationSchema.safeParse(result.data);
        if (!parsed.success) throw toAppError(undefined, result.response.status);
        return parsed.data;
      } catch (error: unknown) {
        if (error instanceof Error) throw error;
        throw toNetworkError(error);
      }
    },
    onSuccess: () => {
      setIdempotencyKey(generateRequestId());
      void queryClient.invalidateQueries({ queryKey: qk.recurringReconciliations() });
    }
  });
}
