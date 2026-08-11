"use client";

import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { RecurringOccurrencePageSchema, type RecurringOccurrence } from "@treasury-ops/shared";

import { apiClient } from "@/lib/api/client";
import { toAppError, toNetworkError } from "@/lib/api/problem";
import { qk } from "@/lib/query/keys";

export function useRecurringOccurrences(
  ruleId: string
): UseQueryResult<RecurringOccurrence[], Error> {
  return useQuery({
    queryKey: qk.recurringOccurrences(ruleId),
    queryFn: async (): Promise<RecurringOccurrence[]> => {
      try {
        const result = await apiClient.GET("/v1/recurring/{ruleId}/occurrences", {
          params: { path: { ruleId }, query: { limit: 50 } }
        });
        if (result.error !== undefined) throw toAppError(result.error, result.response.status);
        const parsed = RecurringOccurrencePageSchema.safeParse(result.data);
        if (!parsed.success) throw toAppError(undefined, result.response.status);
        return parsed.data.items;
      } catch (error: unknown) {
        if (error instanceof Error) throw error;
        throw toNetworkError(error);
      }
    }
  });
}
