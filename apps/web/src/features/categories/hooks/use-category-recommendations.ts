"use client";

import { keepPreviousData, useQuery, type UseQueryResult } from "@tanstack/react-query";
import {
  CategoryRecommendationResponseSchema,
  normalizeCategorySearchText,
  type CategoryKind,
  type CategoryRecommendationResponse
} from "@treasury-ops/shared";

import { apiClient } from "@/lib/api/client";
import { toAppError, toNetworkError } from "@/lib/api/problem";
import { AuthError, ValidationError } from "@/lib/errors";
import { qk } from "@/lib/query/keys";

export type CategoryRecommendationQueryInput = Readonly<{
  enabled: boolean;
  type: CategoryKind;
  description?: string;
  occurredAt: Date;
  limit?: number;
}>;

export function useCategoryRecommendations(
  input: CategoryRecommendationQueryInput
): UseQueryResult<CategoryRecommendationResponse, Error> {
  const limit = input.limit ?? 5;
  const trimmed = input.description?.trim() ?? "";
  const normalizedDescription = normalizeCategorySearchText(trimmed);
  const occurredAt = input.occurredAt.toISOString();
  const queryKey = qk.categoryRecommendationQuery({
    type: input.type,
    description: normalizedDescription,
    draft: trimmed,
    occurredAt,
    limit
  });

  return useQuery({
    queryKey,
    enabled: input.enabled,
    staleTime: 60_000,
    placeholderData: keepPreviousData,
    retry: (failureCount, error) => {
      if (error instanceof ValidationError || error instanceof AuthError) return false;
      return failureCount < 2;
    },
    queryFn: async ({ signal }): Promise<CategoryRecommendationResponse> => {
      try {
        const result = await apiClient.POST("/v1/category-recommendations/query", {
          body:
            normalizedDescription === ""
              ? { type: input.type, occurredAt, limit }
              : {
                  type: input.type,
                  occurredAt,
                  limit,
                  description: trimmed
                },
          signal
        });
        if (result.error !== undefined) throw toAppError(result.error, result.response.status);
        const parsed = CategoryRecommendationResponseSchema.safeParse(result.data);
        if (!parsed.success) throw toAppError(undefined, result.response.status);
        return parsed.data;
      } catch (error: unknown) {
        if (error instanceof Error) throw error;
        throw toNetworkError(error);
      }
    }
  });
}
