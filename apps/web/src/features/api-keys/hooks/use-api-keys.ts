"use client";

import { useMutation, useQuery, useQueryClient, type UseQueryResult } from "@tanstack/react-query";
import {
  ApiKeySchema,
  CreateApiKeyResponseSchema,
  type ApiKey,
  type CreateApiKey,
  type CreateApiKeyResponse,
  type UpdateApiKey
} from "@treasury-ops/shared";
import { z } from "zod";

import { apiClient } from "@/lib/api/client";
import { toAppError, toNetworkError } from "@/lib/api/problem";
import { qk } from "@/lib/query/keys";

const ApiKeysSchema = z.array(ApiKeySchema);

export function useApiKeys(initialData: ApiKey[]): UseQueryResult<ApiKey[], Error> {
  return useQuery({
    queryKey: qk.apiKeys(),
    initialData,
    queryFn: async (): Promise<ApiKey[]> => {
      const result = await apiClient.GET("/v1/api-keys");
      if (result.error !== undefined) throw toAppError(result.error, result.response.status);
      const parsed = ApiKeysSchema.safeParse(result.data);
      if (!parsed.success) throw toAppError(undefined, result.response.status);
      return parsed.data;
    }
  });
}

export function useCreateApiKey() {
  const client = useQueryClient();
  return useMutation<CreateApiKeyResponse, Error, CreateApiKey>({
    mutationFn: async (input): Promise<CreateApiKeyResponse> => {
      try {
        // Reconstruct permissions to remove undefined values
        const permissions: Record<string, string[]> = {};
        if (input.permissions.transactions !== undefined) {
          permissions.transactions = input.permissions.transactions;
        }
        if (input.permissions.categories !== undefined) {
          permissions.categories = input.permissions.categories;
        }
        if (input.permissions.accounts !== undefined) {
          permissions.accounts = input.permissions.accounts;
        }

        const body = {
          name: input.name,
          permissions,
          ...(input.expiresAt !== undefined && { expiresAt: input.expiresAt.toISOString() })
        };
        const result = await apiClient.POST("/v1/api-keys", { body });
        if (result.error !== undefined) throw toAppError(result.error, result.response.status);
        const parsed = CreateApiKeyResponseSchema.safeParse(result.data);
        if (!parsed.success) throw toAppError(undefined, result.response.status);
        return parsed.data;
      } catch (error: unknown) {
        if (error instanceof Error) throw error;
        throw toNetworkError(error);
      }
    },
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: qk.apiKeys() });
    }
  });
}

export function useUpdateApiKey() {
  const client = useQueryClient();
  return useMutation<ApiKey, Error, { keyId: string; input: UpdateApiKey }>({
    mutationFn: async ({ keyId, input }): Promise<ApiKey> => {
      try {
        const body: Record<string, unknown> = {};

        if (input.name !== undefined) {
          body.name = input.name;
        }

        if (input.permissions !== undefined) {
          // Reconstruct permissions to remove undefined values
          const permissions: Record<string, string[]> = {};
          if (input.permissions.transactions !== undefined) {
            permissions.transactions = input.permissions.transactions;
          }
          if (input.permissions.categories !== undefined) {
            permissions.categories = input.permissions.categories;
          }
          if (input.permissions.accounts !== undefined) {
            permissions.accounts = input.permissions.accounts;
          }
          body.permissions = permissions;
        }

        const result = await apiClient.PATCH("/v1/api-keys/{keyId}", {
          params: { path: { keyId } },
          body
        });
        if (result.error !== undefined) throw toAppError(result.error, result.response.status);
        const parsed = ApiKeySchema.safeParse(result.data);
        if (!parsed.success) throw toAppError(undefined, result.response.status);
        return parsed.data;
      } catch (error: unknown) {
        if (error instanceof Error) throw error;
        throw toNetworkError(error);
      }
    },
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: qk.apiKeys() });
    }
  });
}

export function useRevokeApiKey() {
  const client = useQueryClient();
  return useMutation<undefined, Error, string>({
    mutationFn: async (keyId): Promise<undefined> => {
      try {
        const result = await apiClient.DELETE("/v1/api-keys/{keyId}", {
          params: { path: { keyId } }
        });
        if (result.error !== undefined) throw toAppError(result.error, result.response.status);
        return undefined;
      } catch (error: unknown) {
        if (error instanceof Error) throw error;
        throw toNetworkError(error);
      }
    },
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: qk.apiKeys() });
    }
  });
}
