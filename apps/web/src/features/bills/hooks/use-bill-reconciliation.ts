"use client";

import { useMutation, useQueryClient, type UseMutationResult } from "@tanstack/react-query";
import {
  BillStatementRowSchema,
  BillStatementUploadSchema,
  CreditCardBillSchema,
  type BillStatementRow,
  type BillStatementUpload,
  type CreditCardBill,
  type TransactionId,
  type UpdateBillStatementRow
} from "@treasury-ops/shared";
import { useState } from "react";

import { apiClient } from "@/lib/api/client";
import { toAppError, toNetworkError } from "@/lib/api/problem";
import { qk } from "@/lib/query/keys";
import { generateRequestId } from "@/lib/request-id";

type UpdateRowRequest = Readonly<{ rowId: string; patch: UpdateBillStatementRow }>;
type AcknowledgeExtraRequest = Readonly<{
  transactionId: TransactionId;
  acknowledged: boolean;
}>;

function rowPatchBody(patch: UpdateBillStatementRow): {
  matchedTransactionId?: string | null;
  acknowledged?: boolean;
} {
  if (patch.matchedTransactionId !== undefined) {
    return { matchedTransactionId: patch.matchedTransactionId };
  }
  if (patch.acknowledged !== undefined) return { acknowledged: patch.acknowledged };
  throw new RangeError("A statement-row action is required.");
}

async function invalidateBill(
  client: ReturnType<typeof useQueryClient>,
  billId: string
): Promise<void> {
  await Promise.all([
    client.invalidateQueries({ queryKey: qk.billDetail(billId) }),
    client.invalidateQueries({ queryKey: qk.billLists() }),
    client.invalidateQueries({ queryKey: [...qk.billDetail(billId), "statement-rows"] })
  ]);
}

export function useUpdateBillStatementRow(
  billId: string
): UseMutationResult<BillStatementRow, Error, UpdateRowRequest> {
  const client = useQueryClient();
  const [key, setKey] = useState(generateRequestId);
  return useMutation({
    mutationFn: async ({ rowId, patch }): Promise<BillStatementRow> => {
      try {
        const result = await apiClient.PATCH("/v1/bills/{billId}/statement/rows/{rowId}", {
          params: {
            path: { billId, rowId },
            header: { "Idempotency-Key": key }
          },
          body: rowPatchBody(patch)
        });
        if (result.error !== undefined) throw toAppError(result.error, result.response.status);
        const parsed = BillStatementRowSchema.safeParse(result.data);
        if (!parsed.success) throw toAppError(undefined, result.response.status);
        return parsed.data;
      } catch (error: unknown) {
        if (error instanceof Error) throw error;
        throw toNetworkError(error);
      }
    },
    onSuccess: () => setKey(generateRequestId()),
    onSettled: async () => invalidateBill(client, billId)
  });
}

export function useAcknowledgeExtraTransaction(
  billId: string
): UseMutationResult<BillStatementUpload, Error, AcknowledgeExtraRequest> {
  const client = useQueryClient();
  const [key, setKey] = useState(generateRequestId);
  return useMutation({
    mutationFn: async (input): Promise<BillStatementUpload> => {
      try {
        const result = await apiClient.POST("/v1/bills/{billId}/statement/acknowledge-extra", {
          params: { path: { billId }, header: { "Idempotency-Key": key } },
          body: input
        });
        if (result.error !== undefined) throw toAppError(result.error, result.response.status);
        const parsed = BillStatementUploadSchema.safeParse(result.data);
        if (!parsed.success) throw toAppError(undefined, result.response.status);
        return parsed.data;
      } catch (error: unknown) {
        if (error instanceof Error) throw error;
        throw toNetworkError(error);
      }
    },
    onSuccess: () => setKey(generateRequestId()),
    onSettled: async () => invalidateBill(client, billId)
  });
}

export function useReconcileBill(billId: string): UseMutationResult<CreditCardBill, Error, void> {
  const client = useQueryClient();
  const [key, setKey] = useState(generateRequestId);
  return useMutation({
    mutationFn: async (): Promise<CreditCardBill> => {
      try {
        const result = await apiClient.POST("/v1/bills/{billId}/statement/reconcile", {
          params: { path: { billId }, header: { "Idempotency-Key": key } }
        });
        if (result.error !== undefined) throw toAppError(result.error, result.response.status);
        const parsed = CreditCardBillSchema.safeParse(result.data);
        if (!parsed.success) throw toAppError(undefined, result.response.status);
        return parsed.data;
      } catch (error: unknown) {
        if (error instanceof Error) throw error;
        throw toNetworkError(error);
      }
    },
    onSuccess: () => setKey(generateRequestId()),
    onSettled: async () => invalidateBill(client, billId)
  });
}
