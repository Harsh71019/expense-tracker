"use client";

import { useMutation, useQueryClient, type UseMutationResult } from "@tanstack/react-query";
import {
  FinancialProfileSchema,
  SalaryVersionSchema,
  type CreateSalaryVersion,
  type FinancialProfile,
  type FinancialProfileUpdate,
  type SalaryVersion
} from "@treasury-ops/shared";
import { useState } from "react";

import { apiClient } from "@/lib/api/client";
import { toAppError, toNetworkError } from "@/lib/api/problem";
import { qk } from "@/lib/query/keys";
import { generateRequestId } from "@/lib/request-id";

/**
 * Both mutations generate their idempotency key once, on mount, and keep it
 * across retries of the same submission (per AGENTS.md §6 — a flaky mobile
 * connection double-submitting must not append a second salary version). The
 * key is rotated only after a success, which starts a genuinely new
 * operation.
 */
export function useUpdateFinancialProfile(): UseMutationResult<
  FinancialProfile,
  Error,
  FinancialProfileUpdate
> & { readonly idempotencyKey: string } {
  const client = useQueryClient();
  const [key, setKey] = useState(generateRequestId);
  const mutation = useMutation<FinancialProfile, Error, FinancialProfileUpdate>({
    mutationFn: async (input): Promise<FinancialProfile> => {
      try {
        const result = await apiClient.PATCH("/v1/financial-profile", {
          body: input,
          params: { header: { "Idempotency-Key": key } }
        });
        if (result.error !== undefined) throw toAppError(result.error, result.response.status);
        const parsed = FinancialProfileSchema.safeParse(result.data);
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

export function useCreateSalaryVersion(): UseMutationResult<
  SalaryVersion,
  Error,
  CreateSalaryVersion
> & { readonly idempotencyKey: string } {
  const client = useQueryClient();
  const [key, setKey] = useState(generateRequestId);
  const mutation = useMutation<SalaryVersion, Error, CreateSalaryVersion>({
    mutationFn: async (input): Promise<SalaryVersion> => {
      try {
        const result = await apiClient.POST("/v1/financial-profile/salary-versions", {
          body: { ...input, effectiveFrom: input.effectiveFrom.toISOString() },
          params: { header: { "Idempotency-Key": key } }
        });
        if (result.error !== undefined) throw toAppError(result.error, result.response.status);
        const parsed = SalaryVersionSchema.safeParse(result.data);
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
