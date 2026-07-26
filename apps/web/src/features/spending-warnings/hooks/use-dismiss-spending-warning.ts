"use client";

import { useMutation, useQueryClient, type UseMutationResult } from "@tanstack/react-query";
import {
  DismissSpendingWarningResponseSchema,
  type DismissSpendingWarningResponse
} from "@treasury-ops/shared";
import { useState } from "react";

import { apiClient } from "@/lib/api/client";
import { toAppError, toNetworkError } from "@/lib/api/problem";
import { qk } from "@/lib/query/keys";
import { generateRequestId } from "@/lib/request-id";

/**
 * One instance per mounted dismiss control (plan §4 "Dismissal"): the
 * idempotency key is generated when the control mounts and reused for
 * every retry of that control's action. The API scopes idempotency by
 * (user, operation, key) only — not by warningId — so sharing a single
 * hook instance's key across multiple warning cards would let a retry on
 * warning B replay warning A's cached dismiss response. Call this hook
 * inside WarningCard, once per card, not once at the list level.
 */
export function useDismissSpendingWarning(): UseMutationResult<
  DismissSpendingWarningResponse,
  Error,
  string
> {
  const queryClient = useQueryClient();
  const [idempotencyKey, setIdempotencyKey] = useState(generateRequestId);

  return useMutation({
    mutationFn: async (warningId: string): Promise<DismissSpendingWarningResponse> => {
      try {
        const result = await apiClient.POST("/v1/spending-warnings/{warningId}/dismiss", {
          params: {
            path: { warningId },
            header: { "Idempotency-Key": idempotencyKey }
          }
        });
        if (result.error !== undefined) {
          throw toAppError(result.error, result.response.status);
        }
        const parsed = DismissSpendingWarningResponseSchema.safeParse(result.data);
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
    onSuccess: () => {
      setIdempotencyKey(generateRequestId());
      void queryClient.invalidateQueries({ queryKey: qk.spendingWarningLists() });
    }
  });
}
