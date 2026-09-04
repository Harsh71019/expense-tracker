"use client";

import { useMutation, useQueryClient, type UseMutationResult } from "@tanstack/react-query";
import { SafetyEvaluationSchema, type SafetyEvaluation } from "@treasury-ops/shared";
import { useState } from "react";

import { apiClient } from "@/lib/api/client";
import { toAppError, toNetworkError } from "@/lib/api/problem";
import { qk } from "@/lib/query/keys";
import { generateRequestId } from "@/lib/request-id";

/**
 * Forces a fresh Safety Evaluation. The backend recomputes and persists an
 * immutable snapshot only when the input facts have actually changed --
 * a duplicate refresh under different inputs never creates a second row.
 *
 * One idempotency key is generated on mount and kept across retries of the
 * same submission (AGENTS.md §6); it only rotates after a success.
 */
export function useRefreshSafetyEvaluation(): UseMutationResult<
  SafetyEvaluation,
  Error,
  undefined
> & { readonly idempotencyKey: string } {
  const client = useQueryClient();
  const [key, setKey] = useState(generateRequestId);
  const mutation = useMutation<SafetyEvaluation, Error, undefined>({
    mutationFn: async (): Promise<SafetyEvaluation> => {
      try {
        const result = await apiClient.POST("/v1/financial-safety/evaluations/refresh", {
          body: {},
          params: { header: { "Idempotency-Key": key } }
        });
        if (result.error !== undefined) throw toAppError(result.error, result.response.status);
        const parsed = SafetyEvaluationSchema.safeParse(result.data);
        if (!parsed.success) throw toAppError(undefined, result.response.status);
        return parsed.data;
      } catch (error: unknown) {
        if (error instanceof Error) throw error;
        throw toNetworkError(error);
      }
    },
    onSuccess: () => setKey(generateRequestId()),
    onSettled: async () => {
      // Invalidate the "evaluation" prefix, not just the default-asOf leaf --
      // TanStack Query's partial matching requires the filter key to be a
      // prefix of the cached key, so invalidating the "latest" leaf alone
      // would miss any query cached under an explicit `asOf`.
      await client.invalidateQueries({ queryKey: qk.safetyEvaluations() });
    }
  });
  return Object.assign(mutation, { idempotencyKey: key });
}
