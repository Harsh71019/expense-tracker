"use client";

import { useMutation, useQuery, useQueryClient, type UseQueryResult } from "@tanstack/react-query";
import {
  RecurringRuleSchema,
  type CreateRecurringRule,
  type RecurringRule,
  type UpdateRecurringRule
} from "@vyaya/shared";
import { useState } from "react";
import { z } from "zod";

import { apiClient } from "@/lib/api/client";
import { toAppError, toNetworkError } from "@/lib/api/problem";
import { qk } from "@/lib/query/keys";
import { generateRequestId } from "@/lib/request-id";

const RecurringRulesSchema = z.array(RecurringRuleSchema);

type UpdateVariables = Readonly<{ ruleId: string; patch: UpdateRecurringRule }>;

export function useRecurringRules(
  initialData: RecurringRule[]
): UseQueryResult<RecurringRule[], Error> {
  return useQuery({
    queryKey: qk.recurringRules(),
    initialData,
    ...(initialData.length === 0 ? { initialDataUpdatedAt: 0 } : {}),
    queryFn: async (): Promise<RecurringRule[]> => {
      try {
        const result = await apiClient.GET("/v1/recurring");
        if (result.error !== undefined) throw toAppError(result.error, result.response.status);
        const parsed = RecurringRulesSchema.safeParse(result.data);
        if (!parsed.success) throw toAppError(undefined, result.response.status);
        return parsed.data;
      } catch (error: unknown) {
        if (error instanceof Error) throw error;
        throw toNetworkError(error);
      }
    }
  });
}

export function useCreateRecurringRule(): ReturnType<
  typeof useMutation<RecurringRule, Error, CreateRecurringRule>
> {
  const client = useQueryClient();
  const [key, setKey] = useState(generateRequestId);
  return useMutation({
    mutationFn: async (input): Promise<RecurringRule> => {
      try {
        const result = await apiClient.POST("/v1/recurring", {
          body: {
            template: {
              accountId: input.template.accountId,
              ...(input.template.categoryId === undefined
                ? {}
                : { categoryId: input.template.categoryId }),
              type: input.template.type,
              amountMinor: input.template.amountMinor,
              description: input.template.description,
              tags: input.template.tags
            },
            rrule: input.rrule,
            startAt: input.startAt.toISOString()
          },
          params: { header: { "Idempotency-Key": key } }
        });
        if (result.error !== undefined) throw toAppError(result.error, result.response.status);
        const parsed = RecurringRuleSchema.safeParse(result.data);
        if (!parsed.success) throw toAppError(undefined, result.response.status);
        return parsed.data;
      } catch (error: unknown) {
        if (error instanceof Error) throw error;
        throw toNetworkError(error);
      }
    },
    onSuccess: () => {
      setKey(generateRequestId());
    },
    onSettled: async () => {
      await client.invalidateQueries({ queryKey: qk.recurringRules() });
    }
  });
}

export function useUpdateRecurringRule(): ReturnType<
  typeof useMutation<RecurringRule, Error, UpdateVariables>
> {
  const client = useQueryClient();
  const [key, setKey] = useState(generateRequestId);
  return useMutation({
    mutationFn: async ({ ruleId, patch }): Promise<RecurringRule> => {
      try {
        const result = await apiClient.PATCH("/v1/recurring/{ruleId}", {
          body: {
            ...(patch.template === undefined
              ? {}
              : {
                  template: {
                    ...(patch.template.accountId === undefined
                      ? {}
                      : { accountId: patch.template.accountId }),
                    ...(patch.template.categoryId === undefined
                      ? {}
                      : { categoryId: patch.template.categoryId }),
                    ...(patch.template.type === undefined ? {} : { type: patch.template.type }),
                    ...(patch.template.amountMinor === undefined
                      ? {}
                      : { amountMinor: patch.template.amountMinor }),
                    ...(patch.template.description === undefined
                      ? {}
                      : { description: patch.template.description }),
                    ...(patch.template.tags === undefined ? {} : { tags: patch.template.tags })
                  }
                }),
            ...(patch.rrule === undefined ? {} : { rrule: patch.rrule }),
            ...(patch.isPaused === undefined ? {} : { isPaused: patch.isPaused })
          },
          params: { path: { ruleId }, header: { "Idempotency-Key": key } }
        });
        if (result.error !== undefined) throw toAppError(result.error, result.response.status);
        const parsed = RecurringRuleSchema.safeParse(result.data);
        if (!parsed.success) throw toAppError(undefined, result.response.status);
        return parsed.data;
      } catch (error: unknown) {
        if (error instanceof Error) throw error;
        throw toNetworkError(error);
      }
    },
    onSuccess: () => {
      setKey(generateRequestId());
    },
    onSettled: async () => {
      await client.invalidateQueries({ queryKey: qk.recurringRules() });
    }
  });
}
