"use client";

import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult
} from "@tanstack/react-query";
import {
  ProtectionSnapshotSchema,
  ProtectionStateSchema,
  type ProtectionSnapshot,
  type ProtectionState,
  type UpsertProtection
} from "@treasury-ops/shared";
import { useState } from "react";

import { apiClient } from "@/lib/api/client";
import { toAppError, toNetworkError } from "@/lib/api/problem";
import { qk } from "@/lib/query/keys";
import { generateRequestId } from "@/lib/request-id";

export function useProtectionState(
  initialState: ProtectionState | null
): UseQueryResult<ProtectionState | null, Error> {
  return useQuery({
    queryKey: qk.protection(),
    initialData: initialState,
    queryFn: async (): Promise<ProtectionState | null> => {
      try {
        const result = await apiClient.GET("/v1/financial-profile/protection");
        if (result.error !== undefined) throw toAppError(result.error, result.response.status);
        const parsed = ProtectionStateSchema.safeParse(result.data);
        return parsed.success ? parsed.data : null;
      } catch (error: unknown) {
        if (error instanceof Error) throw error;
        throw toNetworkError(error);
      }
    }
  });
}

/**
 * Appends a protection snapshot. The idempotency key is generated once, on
 * mount, and kept across retries of the same submission (AGENTS.md §6 — a flaky
 * mobile connection double-submitting must not append a second snapshot). It
 * rotates only after a success, which begins a genuinely new operation.
 */
export function useSaveProtection(): UseMutationResult<
  ProtectionSnapshot,
  Error,
  UpsertProtection
> & { readonly idempotencyKey: string } {
  const client = useQueryClient();
  const [key, setKey] = useState(generateRequestId);
  const mutation = useMutation<ProtectionSnapshot, Error, UpsertProtection>({
    mutationFn: async (input): Promise<ProtectionSnapshot> => {
      try {
        const result = await apiClient.PUT("/v1/financial-profile/protection", {
          // Dates cross the wire as ISO strings; everything else is already canonical.
          body: {
            ...input,
            effectiveFrom: input.effectiveFrom.toISOString(),
            independentTermExpiresOn: input.independentTermExpiresOn?.toISOString() ?? null,
            independentHealthExpiresOn: input.independentHealthExpiresOn?.toISOString() ?? null
          },
          params: { header: { "Idempotency-Key": key } }
        });
        if (result.error !== undefined) throw toAppError(result.error, result.response.status);
        const parsed = ProtectionSnapshotSchema.safeParse(result.data);
        if (!parsed.success) throw toAppError(undefined, result.response.status);
        return parsed.data;
      } catch (error: unknown) {
        if (error instanceof Error) throw error;
        throw toNetworkError(error);
      }
    },
    onSuccess: () => setKey(generateRequestId()),
    onSettled: async () => {
      await client.invalidateQueries({ queryKey: qk.financialProfile() });
    }
  });
  return Object.assign(mutation, { idempotencyKey: key });
}
