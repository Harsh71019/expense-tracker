"use client";

import { useMutation, useQueryClient, type UseMutationResult } from "@tanstack/react-query";
import { CategorySchema, type Category, type CreateCategory } from "@vyaya/shared";
import { useState } from "react";

import { apiClient } from "@/lib/api/client";
import { toAppError, toNetworkError } from "@/lib/api/problem";
import { qk } from "@/lib/query/keys";
import { generateRequestId } from "@/lib/request-id";

export function useCreateCategory(): UseMutationResult<Category, Error, CreateCategory> {
  const client = useQueryClient();
  const [key, setKey] = useState(generateRequestId);
  return useMutation({
    mutationFn: async (body): Promise<Category> => {
      try {
        const result = await apiClient.POST("/v1/categories", {
          body: {
            name: body.name,
            kind: body.kind,
            ...(body.parentId === undefined ? {} : { parentId: body.parentId }),
            ...(body.icon === undefined ? {} : { icon: body.icon }),
            ...(body.color === undefined ? {} : { color: body.color })
          },
          params: { header: { "Idempotency-Key": key } }
        });
        if (result.error !== undefined) throw toAppError(result.error, result.response.status);
        const parsed = CategorySchema.safeParse(result.data);
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
      await Promise.all([
        client.invalidateQueries({ queryKey: qk.categories() }),
        client.invalidateQueries({ queryKey: qk.transactionLists() }),
        client.invalidateQueries({ queryKey: qk.categoryRules() })
      ]);
    }
  });
}

export function useArchiveCategory(): UseMutationResult<void, Error, string> {
  const client = useQueryClient();
  const [key, setKey] = useState(generateRequestId);
  return useMutation({
    mutationFn: async (categoryId): Promise<void> => {
      try {
        const result = await apiClient.PATCH("/v1/categories/{categoryId}/archive", {
          params: { path: { categoryId }, header: { "Idempotency-Key": key } }
        });
        if (result.error !== undefined) throw toAppError(result.error, result.response.status);
      } catch (error: unknown) {
        if (error instanceof Error) throw error;
        throw toNetworkError(error);
      }
    },
    onSuccess: () => {
      setKey(generateRequestId());
    },
    onSettled: async () => {
      await Promise.all([
        client.invalidateQueries({ queryKey: qk.categories() }),
        client.invalidateQueries({ queryKey: qk.transactionLists() }),
        client.invalidateQueries({ queryKey: qk.categoryRules() })
      ]);
    }
  });
}
