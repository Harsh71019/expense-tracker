"use client";

import { useMutation, useQuery, useQueryClient, type UseQueryResult } from "@tanstack/react-query";
import {
  GoalSchema,
  type CreateGoal,
  type Goal,
  type GoalStatus,
  type ReorderGoals,
  type UpdateGoal
} from "@treasury-ops/shared";
import { useState } from "react";
import { z } from "zod";

import { apiClient } from "@/lib/api/client";
import { toAppError, toNetworkError } from "@/lib/api/problem";
import { qk } from "@/lib/query/keys";
import { generateRequestId } from "@/lib/request-id";

const GoalsSchema = z.array(GoalSchema);
type UpdateGoalRequest = Readonly<{ goalId: string; patch: UpdateGoal }>;

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
        const result =
          input.fundingMode === "linked_account"
            ? await apiClient.POST("/v1/goals", {
                body: {
                  ...common,
                  fundingMode: "linked_account",
                  linkedAccountId: input.linkedAccountId
                },
                params: { header: { "Idempotency-Key": key } }
              })
            : await apiClient.POST("/v1/goals", {
                body: { ...common, fundingMode: "tagged", tag: input.tag },
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
