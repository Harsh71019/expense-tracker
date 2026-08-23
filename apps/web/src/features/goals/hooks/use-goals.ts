import { useMutation, useQuery, useQueryClient, type UseQueryResult } from "@tanstack/react-query";
import {
  CreateSafetyBufferPreferenceSchema,
  GoalContributionSchema,
  GoalSchema,
  SafetyBufferPreferenceSchema,
  type CreateGoal,
  type CreateGoalContribution,
  type CreateSafetyBufferPreference,
  type Goal,
  type GoalContribution,
  type GoalStatus,
  type ReorderGoals,
  type SafetyBufferPreference,
  type UpdateGoal
} from "@treasury-ops/shared";
import { useState } from "react";
import { z } from "zod";

import { apiClient } from "@/lib/api/client";
import { toAppError, toNetworkError } from "@/lib/api/problem";
import { qk } from "@/lib/query/keys";
import { generateRequestId } from "@/lib/request-id";

const GoalsSchema = z.array(GoalSchema);
const GoalContributionsSchema = z.array(GoalContributionSchema);
type UpdateGoalRequest = Readonly<{ goalId: string; patch: UpdateGoal }>;
type RecordGoalContributionRequest = Readonly<{
  goalId: string;
  input: CreateGoalContribution;
}>;

export function useGoals(status: GoalStatus, initialData: Goal[]): UseQueryResult<Goal[], Error> {
  return useQuery({
    queryKey: qk.goalList(status),
    initialData,
    ...(initialData.length === 0 ? { initialDataUpdatedAt: 0 } : {}),
    queryFn: async (): Promise<Goal[]> => {
      try {
        const result = await apiClient.GET("/v1/goals", { params: { query: { status } } });
        if (result.error !== undefined) throw toAppError(result.error, result.response.status);
        const parsed = GoalsSchema.safeParse(result.data);
        if (!parsed.success) throw toAppError(undefined, result.response.status);
        return parsed.data;
      } catch (error: unknown) {
        if (error instanceof Error) throw error;
        throw toNetworkError(error);
      }
    }
  });
}

export function useGoal(
  goalId: string,
  initialData: Goal
): ReturnType<typeof useQuery<Goal, Error>> {
  return useQuery({
    queryKey: qk.goal(goalId),
    initialData,
    queryFn: async (): Promise<Goal> => {
      const result = await apiClient.GET("/v1/goals/{goalId}", {
        params: { path: { goalId } }
      });
      if (result.error !== undefined) throw toAppError(result.error, result.response.status);
      const parsed = GoalSchema.safeParse(result.data);
      if (!parsed.success) throw toAppError(undefined, result.response.status);
      return parsed.data;
    }
  });
}

export function useGoalContributions(
  goalId: string,
  initialData: GoalContribution[]
): UseQueryResult<GoalContribution[], Error> {
  return useQuery({
    queryKey: qk.goalContributions(goalId),
    initialData,
    ...(initialData.length === 0 ? { initialDataUpdatedAt: 0 } : {}),
    queryFn: async (): Promise<GoalContribution[]> => {
      try {
        const result = await apiClient.GET("/v1/goals/{goalId}/contributions", {
          params: { path: { goalId } }
        });
        if (result.error !== undefined) throw toAppError(result.error, result.response.status);
        const parsed = GoalContributionsSchema.safeParse(result.data);
        if (!parsed.success) throw toAppError(undefined, result.response.status);
        return parsed.data;
      } catch (error: unknown) {
        if (error instanceof Error) throw error;
        throw toNetworkError(error);
      }
    }
  });
}

export function useCreateGoal(): ReturnType<typeof useMutation<Goal, Error, CreateGoal>> {
  const client = useQueryClient();
  const [key, setKey] = useState(generateRequestId);
  return useMutation({
    mutationFn: async (input): Promise<Goal> => {
      try {
        const common = {
          name: input.name,
          targetMinor: input.targetMinor,
          ...(input.targetDate === undefined ? {} : { targetDate: input.targetDate.toISOString() })
        };
        let body:
          | {
              name: string;
              targetMinor: number;
              targetDate?: string;
              fundingMode: "linked_account";
              linkedAccountId: string;
            }
          | {
              name: string;
              targetMinor: number;
              targetDate?: string;
              fundingMode: "tagged";
              tag: string;
            }
          | {
              name: string;
              targetMinor: number;
              targetDate?: string;
              fundingMode: "manual_envelope";
            };

        if (input.fundingMode === "linked_account") {
          body = {
            ...common,
            fundingMode: "linked_account",
            linkedAccountId: input.linkedAccountId
          };
        } else if (input.fundingMode === "tagged") {
          body = { ...common, fundingMode: "tagged", tag: input.tag };
        } else {
          body = { ...common, fundingMode: "manual_envelope" };
        }

        const result = await apiClient.POST("/v1/goals", {
          body,
          params: { header: { "Idempotency-Key": key } }
        });
        if (result.error !== undefined) throw toAppError(result.error, result.response.status);
        const parsed = GoalSchema.safeParse(result.data);
        if (!parsed.success) throw toAppError(undefined, result.response.status);
        return parsed.data;
      } catch (error: unknown) {
        if (error instanceof Error) throw error;
        throw toNetworkError(error);
      }
    },
    onSuccess: () => setKey(generateRequestId()),
    onSettled: async () => {
      await client.invalidateQueries({ queryKey: qk.goals() });
    }
  });
}

export function useUpdateGoal(): ReturnType<typeof useMutation<Goal, Error, UpdateGoalRequest>> {
  const client = useQueryClient();
  const [key, setKey] = useState(generateRequestId);
  return useMutation({
    mutationFn: async ({ goalId, patch }): Promise<Goal> => {
      try {
        const result = await apiClient.PATCH("/v1/goals/{goalId}", {
          body: {
            ...(patch.name === undefined ? {} : { name: patch.name }),
            ...(patch.targetMinor === undefined ? {} : { targetMinor: patch.targetMinor }),
            ...(patch.targetDate === undefined
              ? {}
              : {
                  targetDate: patch.targetDate === null ? null : patch.targetDate.toISOString()
                })
          },
          params: { path: { goalId }, header: { "Idempotency-Key": key } }
        });
        if (result.error !== undefined) throw toAppError(result.error, result.response.status);
        const parsed = GoalSchema.safeParse(result.data);
        if (!parsed.success) throw toAppError(undefined, result.response.status);
        return parsed.data;
      } catch (error: unknown) {
        if (error instanceof Error) throw error;
        throw toNetworkError(error);
      }
    },
    onSuccess: (goal) => {
      setKey(generateRequestId());
      client.setQueryData(qk.goal(goal.id), goal);
    },
    onSettled: async (_goal, _error, request) => {
      await Promise.all([
        client.invalidateQueries({ queryKey: qk.goals() }),
        client.invalidateQueries({ queryKey: qk.goalPlan(request.goalId) })
      ]);
    }
  });
}

export function useAbandonGoal(): ReturnType<typeof useMutation<void, Error, string>> {
  const client = useQueryClient();
  const [key, setKey] = useState(generateRequestId);
  return useMutation({
    mutationFn: async (goalId): Promise<void> => {
      try {
        const result = await apiClient.POST("/v1/goals/{goalId}/abandon", {
          params: { path: { goalId }, header: { "Idempotency-Key": key } }
        });
        if (result.error !== undefined) throw toAppError(result.error, result.response.status);
      } catch (error: unknown) {
        if (error instanceof Error) throw error;
        throw toNetworkError(error);
      }
    },
    onSuccess: () => setKey(generateRequestId()),
    onSettled: async (_result, _error, goalId) => {
      await Promise.all([
        client.invalidateQueries({ queryKey: qk.goals() }),
        client.invalidateQueries({ queryKey: qk.goal(goalId) })
      ]);
    }
  });
}

export function useReorderGoals(): ReturnType<typeof useMutation<void, Error, ReorderGoals>> {
  const client = useQueryClient();
  const [key, setKey] = useState(generateRequestId);
  return useMutation({
    mutationFn: async (input): Promise<void> => {
      try {
        const result = await apiClient.PATCH("/v1/goals/reorder", {
          body: input,
          params: { header: { "Idempotency-Key": key } }
        });
        if (result.error !== undefined) throw toAppError(result.error, result.response.status);
      } catch (error: unknown) {
        if (error instanceof Error) throw error;
        throw toNetworkError(error);
      }
    },
    onSuccess: () => setKey(generateRequestId()),
    onSettled: async () => {
      await client.invalidateQueries({ queryKey: qk.goals() });
    }
  });
}

export function useSaveSafetyBuffer(): ReturnType<
  typeof useMutation<SafetyBufferPreference, Error, CreateSafetyBufferPreference>
> {
  const client = useQueryClient();
  const [key, setKey] = useState(generateRequestId);
  return useMutation({
    mutationFn: async (input): Promise<SafetyBufferPreference> => {
      const parsed = CreateSafetyBufferPreferenceSchema.safeParse(input);
      if (!parsed.success) {
        throw new Error(parsed.error.issues[0]?.message ?? "Check the safety buffer details.");
      }

      try {
        const body: {
          mode: CreateSafetyBufferPreference["mode"];
          amountMinor?: number;
          months?: number;
          emergencyFundGoalId?: string;
          effectiveFrom?: string;
        } = { mode: parsed.data.mode };

        if (parsed.data.amountMinor !== undefined) {
          body.amountMinor = parsed.data.amountMinor;
        }
        if (parsed.data.months !== undefined) {
          body.months = parsed.data.months;
        }
        if (parsed.data.emergencyFundGoalId !== undefined) {
          body.emergencyFundGoalId = parsed.data.emergencyFundGoalId;
        }
        if (parsed.data.effectiveFrom !== undefined) {
          body.effectiveFrom = parsed.data.effectiveFrom.toISOString();
        }

        const result = await apiClient.POST("/v1/safety-buffer", {
          body,
          params: { header: { "Idempotency-Key": key } }
        });
        if (result.error !== undefined) throw toAppError(result.error, result.response.status);
        const response = SafetyBufferPreferenceSchema.safeParse(result.data);
        if (!response.success) throw toAppError(undefined, result.response.status);
        return response.data;
      } catch (error: unknown) {
        if (error instanceof Error) throw error;
        throw toNetworkError(error);
      }
    },
    onSuccess: () => setKey(generateRequestId()),
    onSettled: async () => {
      await client.invalidateQueries({ queryKey: qk.goals() });
    }
  });
}

export function useRecordGoalContribution(): ReturnType<
  typeof useMutation<Goal, Error, RecordGoalContributionRequest>
> {
  const client = useQueryClient();
  const [key, setKey] = useState(generateRequestId);
  return useMutation({
    mutationFn: async ({ goalId, input }): Promise<Goal> => {
      try {
        const result = await apiClient.POST("/v1/goals/{goalId}/contributions", {
          body: {
            type: input.type,
            amountMinor: input.amountMinor,
            ...(input.note === undefined ? {} : { note: input.note }),
            ...(input.occurredAt === undefined
              ? {}
              : { occurredAt: input.occurredAt.toISOString() })
          },
          params: { path: { goalId }, header: { "Idempotency-Key": key } }
        });
        if (result.error !== undefined) throw toAppError(result.error, result.response.status);
        const parsed = GoalSchema.safeParse(result.data);
        if (!parsed.success) throw toAppError(undefined, result.response.status);
        return parsed.data;
      } catch (error: unknown) {
        if (error instanceof Error) throw error;
        throw toNetworkError(error);
      }
    },
    onSuccess: (goal) => {
      setKey(generateRequestId());
      client.setQueryData(qk.goal(goal.id), goal);
    },
    onSettled: async (_goal, _error, request) => {
      await Promise.all([
        client.invalidateQueries({ queryKey: qk.goals() }),
        client.invalidateQueries({ queryKey: qk.goal(request.goalId) }),
        client.invalidateQueries({ queryKey: qk.goalContributions(request.goalId) }),
        client.invalidateQueries({ queryKey: qk.goalPlan(request.goalId) })
      ]);
    }
  });
}
