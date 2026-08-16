"use client";

import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult
} from "@tanstack/react-query";
import {
  DeclaredDebtPageSchema,
  DeclaredDebtSchema,
  type CreateDeclaredDebt,
  type DeclaredDebt,
  type DeclaredDebtPage,
  type DeclaredDebtStatus,
  type UpdateDeclaredDebt
} from "@treasury-ops/shared";
import { useState } from "react";

import { apiClient } from "@/lib/api/client";
import { toAppError, toNetworkError } from "@/lib/api/problem";
import { qk } from "@/lib/query/keys";
import { generateRequestId } from "@/lib/request-id";

export function useDeclaredDebts(
  options: Readonly<{ status: DeclaredDebtStatus; limit: number }>,
  initialPage: DeclaredDebtPage | null
): UseQueryResult<DeclaredDebtPage | null, Error> {
  return useQuery({
    queryKey: qk.declaredDebtList(options),
    initialData: initialPage,
    queryFn: async (): Promise<DeclaredDebtPage | null> => {
      try {
        const result = await apiClient.GET("/v1/financial-profile/debts", {
          params: { query: { limit: options.limit, status: options.status } }
        });
        if (result.error !== undefined) throw toAppError(result.error, result.response.status);
        const parsed = DeclaredDebtPageSchema.safeParse(result.data);
        return parsed.success ? parsed.data : null;
      } catch (error: unknown) {
        if (error instanceof Error) throw error;
        throw toNetworkError(error);
      }
    }
  });
}

/** One idempotency key per mounted form, kept across retries, rotated on success. */
export function useCreateDeclaredDebt(): UseMutationResult<
  DeclaredDebt,
  Error,
  CreateDeclaredDebt
> & { readonly idempotencyKey: string } {
  const client = useQueryClient();
  const [key, setKey] = useState(generateRequestId);
  const mutation = useMutation<DeclaredDebt, Error, CreateDeclaredDebt>({
    mutationFn: async (input): Promise<DeclaredDebt> => {
      try {
        const result = await apiClient.POST("/v1/financial-profile/debts", {
          body: input,
          params: { header: { "Idempotency-Key": key } }
        });
        if (result.error !== undefined) throw toAppError(result.error, result.response.status);
        const parsed = DeclaredDebtSchema.safeParse(result.data);
        if (!parsed.success) throw toAppError(undefined, result.response.status);
        return parsed.data;
      } catch (error: unknown) {
        if (error instanceof Error) throw error;
        throw toNetworkError(error);
      }
    },
    onSuccess: () => setKey(generateRequestId()),
    onSettled: async () => {
      await client.invalidateQueries({ queryKey: qk.declaredDebts() });
    }
  });
  return Object.assign(mutation, { idempotencyKey: key });
}

export type UpdateDeclaredDebtInput = Readonly<{
  debtId: string;
  patch: UpdateDeclaredDebt;
}>;

/**
 * Updates debt metadata, including resolving it. Resolution removes a debt from
 * active planning checks — it posts no transaction and changes no asset, so
 * nothing here invalidates ledger, account, or net-worth queries.
 */
export function useUpdateDeclaredDebt(): UseMutationResult<
  DeclaredDebt,
  Error,
  UpdateDeclaredDebtInput
> & { readonly idempotencyKey: string } {
  const client = useQueryClient();
  const [key, setKey] = useState(generateRequestId);
  const mutation = useMutation<DeclaredDebt, Error, UpdateDeclaredDebtInput>({
    mutationFn: async ({ debtId, patch }): Promise<DeclaredDebt> => {
      // Absent fields are omitted rather than sent as `undefined`: the API
      // treats a present key as "change this", so an accidental undefined
      // would read as an explicit instruction.
      const body = {
        ...(patch.name === undefined ? {} : { name: patch.name }),
        ...(patch.kind === undefined ? {} : { kind: patch.kind }),
        ...(patch.declaredOutstandingMinor === undefined
          ? {}
          : { declaredOutstandingMinor: patch.declaredOutstandingMinor }),
        ...(patch.annualRateBps === undefined ? {} : { annualRateBps: patch.annualRateBps }),
        ...(patch.minimumPaymentMinor === undefined
          ? {}
          : { minimumPaymentMinor: patch.minimumPaymentMinor }),
        ...(patch.status === undefined ? {} : { status: patch.status })
      };

      try {
        const result = await apiClient.PATCH("/v1/financial-profile/debts/{debtId}", {
          body,
          params: { path: { debtId }, header: { "Idempotency-Key": key } }
        });
        if (result.error !== undefined) throw toAppError(result.error, result.response.status);
        const parsed = DeclaredDebtSchema.safeParse(result.data);
        if (!parsed.success) throw toAppError(undefined, result.response.status);
        return parsed.data;
      } catch (error: unknown) {
        if (error instanceof Error) throw error;
        throw toNetworkError(error);
      }
    },
    onSuccess: () => setKey(generateRequestId()),
    onSettled: async () => {
      await client.invalidateQueries({ queryKey: qk.declaredDebts() });
    }
  });
  return Object.assign(mutation, { idempotencyKey: key });
}
