"use client";

import {
  useInfiniteQuery,
  useQuery,
  type InfiniteData,
  type UseInfiniteQueryResult,
  type UseQueryResult
} from "@tanstack/react-query";
import {
  FinancialProfileStateSchema,
  SalaryStatisticsSchema,
  SalaryVersionPageSchema,
  type FinancialProfileState,
  type SalaryStatistics,
  type SalaryVersionPage
} from "@treasury-ops/shared";

import { apiClient } from "@/lib/api/client";
import { toAppError, toNetworkError } from "@/lib/api/problem";
import { qk } from "@/lib/query/keys";

export function useFinancialProfileState(
  initialState: FinancialProfileState | null
): UseQueryResult<FinancialProfileState | null, Error> {
  return useQuery({
    queryKey: qk.financialProfileState(),
    initialData: initialState,
    queryFn: async (): Promise<FinancialProfileState | null> => {
      try {
        const result = await apiClient.GET("/v1/financial-profile");
        if (result.error !== undefined) throw toAppError(result.error, result.response.status);
        const parsed = FinancialProfileStateSchema.safeParse(result.data);
        return parsed.success ? parsed.data : null;
      } catch (error: unknown) {
        if (error instanceof Error) throw error;
        throw toNetworkError(error);
      }
    }
  });
}

/**
 * Derived salary figures always come from the API. A 422 here means the
 * profile is not set up yet, which is a state the panel renders, not an error
 * it surfaces — so it resolves to `null` instead of throwing.
 */
export function useSalaryStatistics(
  initialStatistics: SalaryStatistics | null
): UseQueryResult<SalaryStatistics | null, Error> {
  return useQuery({
    queryKey: qk.salaryStatistics(),
    initialData: initialStatistics,
    queryFn: async (): Promise<SalaryStatistics | null> => {
      try {
        const result = await apiClient.GET("/v1/financial-profile/salary-statistics", {
          params: { query: {} }
        });
        if (result.error !== undefined) {
          if (result.response.status === 422) return null;
          throw toAppError(result.error, result.response.status);
        }
        const parsed = SalaryStatisticsSchema.safeParse(result.data);
        return parsed.success ? parsed.data : null;
      } catch (error: unknown) {
        if (error instanceof Error) throw error;
        throw toNetworkError(error);
      }
    }
  });
}

export function useSalaryVersions(
  limit: number,
  initialPage: SalaryVersionPage | null
): UseInfiniteQueryResult<InfiniteData<SalaryVersionPage, string | null>, Error> {
  const initialCursor: string | null = null;
  return useInfiniteQuery<
    SalaryVersionPage,
    Error,
    InfiniteData<SalaryVersionPage, string | null>,
    ReturnType<typeof qk.salaryVersions>,
    string | null
  >({
    queryKey: qk.salaryVersions(limit),
    initialPageParam: initialCursor,
    ...(initialPage === null
      ? {}
      : { initialData: { pages: [initialPage], pageParams: [initialCursor] } }),
    queryFn: async ({ pageParam }): Promise<SalaryVersionPage> => {
      try {
        const result = await apiClient.GET("/v1/financial-profile/salary-versions", {
          params: { query: { limit, ...(pageParam === null ? {} : { cursor: pageParam }) } }
        });
        if (result.error !== undefined) throw toAppError(result.error, result.response.status);
        const parsed = SalaryVersionPageSchema.safeParse(result.data);
        if (!parsed.success) throw toAppError(undefined, result.response.status);
        return parsed.data;
      } catch (error: unknown) {
        if (error instanceof Error) throw error;
        throw toNetworkError(error);
      }
    },
    getNextPageParam: (page) => (page.pageInfo.hasMore ? page.pageInfo.nextCursor : undefined)
  });
}
