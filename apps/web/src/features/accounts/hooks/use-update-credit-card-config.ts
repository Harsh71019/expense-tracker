"use client";

import { useMutation, useQueryClient, type UseMutationResult } from "@tanstack/react-query";
import {
  AccountSchema,
  type Account,
  type AccountId,
  type CreditCardConfigInput
} from "@treasury-ops/shared";
import { useState } from "react";

import { apiClient } from "@/lib/api/client";
import { toAppError, toNetworkError } from "@/lib/api/problem";
import { qk } from "@/lib/query/keys";
import { generateRequestId } from "@/lib/request-id";

type UpdateCreditCardConfigRequest = Readonly<{
  accountId: AccountId;
  config: CreditCardConfigInput;
}>;

export function useUpdateCreditCardConfig(): UseMutationResult<
  Account,
  Error,
  UpdateCreditCardConfigRequest
> {
  const client = useQueryClient();
  const [key, setKey] = useState(generateRequestId);
  return useMutation({
    mutationFn: async ({ accountId, config }): Promise<Account> => {
      try {
        const result = await apiClient.PATCH("/v1/accounts/{accountId}/credit-card-config", {
          params: { path: { accountId }, header: { "Idempotency-Key": key } },
          body: config
        });
        if (result.error !== undefined) throw toAppError(result.error, result.response.status);
        const parsed = AccountSchema.safeParse(result.data);
        if (!parsed.success) throw toAppError(undefined, result.response.status);
        return parsed.data;
      } catch (error: unknown) {
        if (error instanceof Error) throw error;
        throw toNetworkError(error);
      }
    },
    onSuccess: () => setKey(generateRequestId()),
    onSettled: async () => {
      await Promise.all([
        client.invalidateQueries({ queryKey: qk.accounts() }),
        client.invalidateQueries({ queryKey: qk.billLists() }),
        client.invalidateQueries({ queryKey: qk.billDetails() })
      ]);
    }
  });
}
