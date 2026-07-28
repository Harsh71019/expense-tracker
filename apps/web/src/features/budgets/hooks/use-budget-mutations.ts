"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  BudgetSchema,
  UpsertBudgetSchema,
  type Budget,
  type UpsertBudget
} from "@treasury-ops/shared";
import { useState } from "react";

import { apiClient } from "@/lib/api/client";
import { toAppError, toNetworkError } from "@/lib/api/problem";
import { qk } from "@/lib/query/keys";
import { generateRequestId } from "@/lib/request-id";

type UpsertBudgetRequest = Readonly<{
  categoryId: string;
  input: UpsertBudget;
}>;

export function useUpsertBudget(): ReturnType<
  typeof useMutation<Budget, Error, UpsertBudgetRequest>
> {
  const client = useQueryClient();
  const [key, setKey] = useState(generateRequestId);
  return useMutation({
    mutationFn: async ({ categoryId, input }): Promise<Budget> => {
      try {
        const body = UpsertBudgetSchema.parse(input);
        const result = await apiClient.PUT("/v1/budgets/{categoryId}", {
          body,
          params: {
            path: { categoryId },
            header: { "Idempotency-Key": key }
          }
        });
        if (result.error !== undefined) {
          throw toAppError(result.error, result.response.status);
        }
        const parsed = BudgetSchema.safeParse(result.data);
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
    onSuccess: () => setKey(generateRequestId()),
    onSettled: async () => {
      await client.invalidateQueries({ queryKey: qk.budgets() });
    }
  });
}

export function useArchiveBudget(): ReturnType<typeof useMutation<Budget, Error, string>> {
  const client = useQueryClient();
  const [key, setKey] = useState(generateRequestId);
  return useMutation({
    mutationFn: async (budgetId): Promise<Budget> => {
      try {
        const result = await apiClient.PATCH("/v1/budgets/{budgetId}/archive", {
          params: {
            path: { budgetId },
            header: { "Idempotency-Key": key }
          }
        });
        if (result.error !== undefined) {
          throw toAppError(result.error, result.response.status);
        }
        const parsed = BudgetSchema.safeParse(result.data);
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
    onSuccess: () => setKey(generateRequestId()),
    onSettled: async () => {
      await client.invalidateQueries({ queryKey: qk.budgets() });
    }
  });
}
