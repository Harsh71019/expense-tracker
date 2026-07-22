"use client";

import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { CategorySchema, type Category } from "@treasury-ops/shared";
import { z } from "zod";

import { apiClient } from "@/lib/api/client";
import { toAppError, toNetworkError } from "@/lib/api/problem";
import { qk } from "@/lib/query/keys";

const CategoriesSchema = z.array(CategorySchema);

export function useCategories(initialData?: Category[]): UseQueryResult<Category[], Error> {
  return useQuery({
    queryKey: qk.categories(),
    ...(initialData === undefined ? {} : { initialData }),
    queryFn: async (): Promise<Category[]> => {
      try {
        const result = await apiClient.GET("/v1/categories");
        if (result.error !== undefined) throw toAppError(result.error, result.response.status);
        const parsed = CategoriesSchema.safeParse(result.data);
        if (!parsed.success) throw toAppError(undefined, result.response.status);
        return parsed.data;
      } catch (error: unknown) {
        if (error instanceof Error) throw error;
        throw toNetworkError(error);
      }
    }
  });
}
