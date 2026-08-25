"use client";

import { useMutation, useQueryClient, type UseMutationResult } from "@tanstack/react-query";
import {
  ReserveSourceSchema,
  type ReserveSource,
  type ReserveSourceKind,
  type UpdateReserveSource
} from "@treasury-ops/shared";
import { useState } from "react";

import { apiClient } from "@/lib/api/client";
import { toAppError, toNetworkError } from "@/lib/api/problem";
import { qk } from "@/lib/query/keys";
import { generateRequestId } from "@/lib/request-id";

export type UpdateReserveSourceInput = Readonly<{
  sourceKind: ReserveSourceKind;
  sourceId: string;
  patch: UpdateReserveSource;
}>;

/**
 * Classifies (or reclassifies) one reserve source. Selecting a source only
 * changes this planning metadata -- it never moves money, changes a balance,
 * or writes to the ledger.
 *
 * One idempotency key is generated on mount and kept across retries of the
 * same submission (AGENTS.md §6); it only rotates after a success.
 *
 * On settle, invalidates the reserve source list, the reserve aggregate, and
 * the financial readiness diagnostic -- all three read this classification.
 */
export function useUpdateReserveSource(): UseMutationResult<
  ReserveSource,
  Error,
  UpdateReserveSourceInput
> & { readonly idempotencyKey: string } {
  const client = useQueryClient();
  const [key, setKey] = useState(generateRequestId);
  const mutation = useMutation<ReserveSource, Error, UpdateReserveSourceInput>({
    mutationFn: async ({ sourceKind, sourceId, patch }): Promise<ReserveSource> => {
      try {
        const body = {
          liquidityTier: patch.liquidityTier,
          isIncluded: patch.isIncluded,
          ...(patch.eligibleCapMinor === undefined
            ? {}
            : { eligibleCapMinor: patch.eligibleCapMinor }),
          ...(patch.effectiveFrom === undefined
            ? {}
            : { effectiveFrom: patch.effectiveFrom.toISOString() })
        };
        const result = await apiClient.PUT(
          "/v1/financial-safety/reserve-sources/{sourceKind}/{sourceId}",
          {
            body,
            params: { path: { sourceKind, sourceId }, header: { "Idempotency-Key": key } }
          }
        );
        if (result.error !== undefined) throw toAppError(result.error, result.response.status);
        const parsed = ReserveSourceSchema.safeParse(result.data);
        if (!parsed.success) throw toAppError(undefined, result.response.status);
        return parsed.data;
      } catch (error: unknown) {
        if (error instanceof Error) throw error;
        throw toNetworkError(error);
      }
    },
    onSuccess: () => setKey(generateRequestId()),
    onSettled: async () => {
      // Covers both the reserve source list and the reserve aggregate (both
      // nested under the shared "financial-safety" root) in one call, plus
      // the financial readiness diagnostic, which also reads this
      // classification.
      await Promise.all([
        client.invalidateQueries({ queryKey: qk.financialSafety() }),
        client.invalidateQueries({ queryKey: qk.financialProfile() })
      ]);
    }
  });
  return Object.assign(mutation, { idempotencyKey: key });
}
