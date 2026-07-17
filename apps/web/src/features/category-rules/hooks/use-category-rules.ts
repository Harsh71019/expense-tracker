"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CategoryRuleSchema, type CategoryRule, type CreateCategoryRule } from "@vyaya/shared";
import { useState } from "react";
import { z } from "zod";

import { apiClient } from "@/lib/api/client";
import { toAppError, toNetworkError } from "@/lib/api/problem";
import { qk } from "@/lib/query/keys";
import { generateRequestId } from "@/lib/request-id";

const RulesSchema = z.array(CategoryRuleSchema);

export function useCategoryRules(
  initialData: CategoryRule[]
): ReturnType<typeof useQuery<CategoryRule[], Error>> {
  return useQuery({
    queryKey: qk.categoryRules(),
    initialData,
    queryFn: async (): Promise<CategoryRule[]> => {
      const result = await apiClient.GET("/v1/category-rules");
      if (result.error !== undefined) throw toAppError(result.error, result.response.status);
      const parsed = RulesSchema.safeParse(result.data);
      if (!parsed.success) throw toAppError(undefined, result.response.status);
      return parsed.data;
    }
  });
}

export function useCreateCategoryRule(): ReturnType<
  typeof useMutation<CategoryRule, Error, CreateCategoryRule>
> {
  const client = useQueryClient();
  const [key, setKey] = useState(generateRequestId);
  return useMutation({
    mutationFn: async (body): Promise<CategoryRule> => {
      try {
        const result = await apiClient.POST("/v1/category-rules", {
          body,
          params: { header: { "Idempotency-Key": key } }
        });
        if (result.error !== undefined) throw toAppError(result.error, result.response.status);
        const parsed = CategoryRuleSchema.safeParse(result.data);
        if (!parsed.success) throw toAppError(undefined, result.response.status);
        return parsed.data;
      } catch (error: unknown) {
        if (error instanceof Error) throw error;
        throw toNetworkError(error);
      }
    },
    onSuccess: async () => {
      setKey(generateRequestId());
      await client.invalidateQueries({ queryKey: qk.categoryRules() });
    }
  });
}

export function useDeleteCategoryRule(): ReturnType<typeof useMutation<void, Error, string>> {
  const client = useQueryClient();
  const [key, setKey] = useState(generateRequestId);
  return useMutation({
    mutationFn: async (ruleId): Promise<void> => {
      try {
        const result = await apiClient.DELETE("/v1/category-rules/{ruleId}", {
          params: { path: { ruleId }, header: { "Idempotency-Key": key } }
        });
        if (result.error !== undefined) throw toAppError(result.error, result.response.status);
      } catch (error: unknown) {
        if (error instanceof Error) throw error;
        throw toNetworkError(error);
      }
    },
    onSuccess: async () => {
      setKey(generateRequestId());
      await client.invalidateQueries({ queryKey: qk.categoryRules() });
    }
  });
}
