"use client";

import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { RecurringOccurrenceSchema, type RecurringOccurrence } from "@treasury-ops/shared";
import { z } from "zod";

import { apiClient } from "@/lib/api/client";
import { toAppError, toNetworkError } from "@/lib/api/problem";
import { qk } from "@/lib/query/keys";

const OutstandingOccurrencesSchema = z.array(RecurringOccurrenceSchema);

export function useOutstandingRecurringOccurrences(): UseQueryResult<RecurringOccurrence[], Error> {
  return useQuery({
    queryKey: qk.recurringOccurrencesOutstanding(),
    queryFn: async (): Promise<RecurringOccurrence[]> => {
      try {
        const result = await apiClient.GET("/v1/recurring/occurrences/outstanding");
        if (result.error !== undefined) throw toAppError(result.error, result.response.status);
        const parsed = OutstandingOccurrencesSchema.safeParse(result.data);
        if (!parsed.success) throw toAppError(undefined, result.response.status);
        return parsed.data;
      } catch (error: unknown) {
        if (error instanceof Error) throw error;
        throw toNetworkError(error);
      }
    }
  });
}
