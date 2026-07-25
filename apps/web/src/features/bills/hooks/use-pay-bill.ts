"use client";

import { useMutation, useQueryClient, type UseMutationResult } from "@tanstack/react-query";
import {
  BillPaymentResultSchema,
  type BillPaymentResult,
  type PayCreditCardBill
} from "@treasury-ops/shared";
import { useState } from "react";

import { apiClient } from "@/lib/api/client";
import { toAppError, toNetworkError } from "@/lib/api/problem";
import { qk } from "@/lib/query/keys";
import { generateRequestId } from "@/lib/request-id";

export function usePayBill(
  billId: string
): UseMutationResult<BillPaymentResult, Error, PayCreditCardBill> {
  const client = useQueryClient();
  const [key, setKey] = useState(generateRequestId);
  return useMutation({
    mutationFn: async (input): Promise<BillPaymentResult> => {
      try {
        const result = await apiClient.POST("/v1/bills/{billId}/pay", {
          params: { path: { billId }, header: { "Idempotency-Key": key } },
          body: {
            fromAccountId: input.fromAccountId,
            amountMinor: input.amountMinor,
            occurredAt: input.occurredAt.toISOString()
          }
        });
        if (result.error !== undefined) throw toAppError(result.error, result.response.status);
        const parsed = BillPaymentResultSchema.safeParse(result.data);
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
        client.invalidateQueries({ queryKey: qk.billDetail(billId) }),
        client.invalidateQueries({ queryKey: qk.billLists() }),
        client.invalidateQueries({ queryKey: qk.accounts() }),
        client.invalidateQueries({ queryKey: qk.transactionLists() }),
        client.invalidateQueries({ queryKey: qk.netWorth() })
      ]);
    }
  });
}
