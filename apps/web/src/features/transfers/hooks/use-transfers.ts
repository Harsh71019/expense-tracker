"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  TransferReversalSchema,
  TransferSchema,
  type CreateTransfer,
  type Transfer,
  type TransferReversal
} from "@treasury-ops/shared";
import { useState } from "react";

import { apiClient } from "@/lib/api/client";
import { toAppError, toNetworkError } from "@/lib/api/problem";
import { qk } from "@/lib/query/keys";
import { generateRequestId } from "@/lib/request-id";

export function useCreateTransfer(): ReturnType<
  typeof useMutation<Transfer, Error, CreateTransfer>
> {
  const client = useQueryClient();
  const [key, setKey] = useState(generateRequestId);
  return useMutation({
    mutationFn: async (body): Promise<Transfer> => {
      try {
        const result = await apiClient.POST("/v1/transfers", {
          body: {
            fromAccountId: body.fromAccountId,
            toAccountId: body.toAccountId,
            amountMinor: body.amountMinor,
            occurredAt: body.occurredAt.toISOString(),
            description: body.description,
            ...(body.tags === undefined ? {} : { tags: body.tags })
          },
          params: { header: { "Idempotency-Key": key } }
        });
        if (result.error !== undefined) throw toAppError(result.error, result.response.status);
        const parsed = TransferSchema.safeParse(result.data);
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
        client.invalidateQueries({ queryKey: qk.accounts() }),
        client.invalidateQueries({ queryKey: qk.transactionLists() }),
        client.invalidateQueries({ queryKey: qk.netWorth() })
      ]);
    }
  });
}

export function useReverseTransfer(): ReturnType<
  typeof useMutation<TransferReversal, Error, string>
> {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (transferGroupId): Promise<TransferReversal> => {
      try {
        const result = await apiClient.POST("/v1/transfers/{transferGroupId}/reverse", {
          params: { path: { transferGroupId } }
        });
        if (result.error !== undefined) throw toAppError(result.error, result.response.status);
        const parsed = TransferReversalSchema.safeParse(result.data);
        if (!parsed.success) throw toAppError(undefined, result.response.status);
        return parsed.data;
      } catch (error: unknown) {
        if (error instanceof Error) throw error;
        throw toNetworkError(error);
      }
    },
    onSettled: async () => {
      await Promise.all([
        client.invalidateQueries({ queryKey: qk.accounts() }),
        client.invalidateQueries({ queryKey: qk.transactionLists() }),
        client.invalidateQueries({ queryKey: qk.netWorth() })
      ]);
    }
  });
}
