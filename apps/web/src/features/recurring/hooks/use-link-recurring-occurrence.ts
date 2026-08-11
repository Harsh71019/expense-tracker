"use client";

import { useMutation, useQueryClient, type UseMutationResult } from "@tanstack/react-query";
import { RecurringOccurrenceSchema, type RecurringOccurrence } from "@treasury-ops/shared";
import { useState } from "react";

import { apiClient } from "@/lib/api/client";
import { toAppError, toNetworkError } from "@/lib/api/problem";
import { qk } from "@/lib/query/keys";
import { generateRequestId } from "@/lib/request-id";

export type LinkRecurringOccurrenceInput = Readonly<{
  ruleId: string;
  occurrenceId: string;
  transactionId: string;
}>;

export function useLinkRecurringOccurrence(): UseMutationResult<
  RecurringOccurrence,
  Error,
  LinkRecurringOccurrenceInput
> {
  const client = useQueryClient();
  const [key, setKey] = useState(generateRequestId);
  return useMutation({
    mutationFn: async (input): Promise<RecurringOccurrence> => {
      try {
        const result = await apiClient.POST(
          "/v1/recurring/{ruleId}/occurrences/{occurrenceId}/link-payment",
          {
            params: {
              path: { ruleId: input.ruleId, occurrenceId: input.occurrenceId },
              header: { "Idempotency-Key": key }
            },
            body: { transactionId: input.transactionId }
          }
        );
        if (result.error !== undefined) throw toAppError(result.error, result.response.status);
        const parsed = RecurringOccurrenceSchema.safeParse(result.data);
        if (!parsed.success) throw toAppError(undefined, result.response.status);
        return parsed.data;
      } catch (error: unknown) {
        if (error instanceof Error) throw error;
        throw toNetworkError(error);
      }
    },
    onSuccess: () => setKey(generateRequestId()),
    onSettled: async (_data, _error, variables) => {
      await Promise.all([
        client.invalidateQueries({ queryKey: qk.recurringOccurrences(variables.ruleId) }),
        client.invalidateQueries({ queryKey: qk.recurringOccurrencesOutstanding() }),
        client.invalidateQueries({ queryKey: qk.recurringRules() }),
        client.invalidateQueries({ queryKey: qk.txn(variables.transactionId) }),
        client.invalidateQueries({ queryKey: qk.transactionLists() })
      ]);
    }
  });
}
