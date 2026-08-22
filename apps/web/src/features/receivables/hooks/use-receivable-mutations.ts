"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ReceivableMutationResultSchema,
  ReceivableSchema,
  type CreateReceivable,
  type CreateReceivableCorrection,
  type Receivable,
  type ReceivableMutationResult,
  type RecordReceivableRepayment,
  type UpdateReceivableMetadata
} from "@treasury-ops/shared";
import { useState } from "react";

import { apiClient } from "@/lib/api/client";
import { toAppError, toNetworkError } from "@/lib/api/problem";
import { qk } from "@/lib/query/keys";
import { generateRequestId } from "@/lib/request-id";

type RepaymentRequest = Readonly<{ receivableId: string; body: RecordReceivableRepayment }>;
type CorrectionRequest = Readonly<{ receivableId: string; body: CreateReceivableCorrection }>;
type MetadataRequest = Readonly<{ receivableId: string; body: UpdateReceivableMetadata }>;

type CreateReceivableRequestBody =
  | {
      fundingMode: "lend_now";
      counterpartyName: string;
      principalMinor: number;
      accountId: string;
      openedAt: string;
      dueAt?: string;
      note?: string;
      description: string;
    }
  | {
      fundingMode: "opening_balance";
      counterpartyName: string;
      outstandingMinor: number;
      openedAt: string;
      dueAt?: string;
      note?: string;
    };

type RecordRepaymentRequestBody =
  | {
      captureMode: "receive_now";
      accountId: string;
      amountMinor: number;
      occurredAt: string;
      description: string;
    }
  | { captureMode: "link_existing"; transactionId: string };

function serializeCreateReceivable(body: CreateReceivable): CreateReceivableRequestBody {
  if (body.fundingMode === "lend_now") {
    return {
      fundingMode: "lend_now",
      counterpartyName: body.counterpartyName,
      principalMinor: body.principalMinor,
      accountId: body.accountId,
      openedAt: body.openedAt.toISOString(),
      ...(body.dueAt === undefined ? {} : { dueAt: body.dueAt.toISOString() }),
      ...(body.note === undefined ? {} : { note: body.note }),
      description: body.description
    };
  }
  return {
    fundingMode: "opening_balance",
    counterpartyName: body.counterpartyName,
    outstandingMinor: body.outstandingMinor,
    openedAt: body.openedAt.toISOString(),
    ...(body.dueAt === undefined ? {} : { dueAt: body.dueAt.toISOString() }),
    ...(body.note === undefined ? {} : { note: body.note })
  };
}

function serializeRepayment(body: RecordReceivableRepayment): RecordRepaymentRequestBody {
  if (body.captureMode === "receive_now") {
    return {
      captureMode: "receive_now",
      accountId: body.accountId,
      amountMinor: body.amountMinor,
      occurredAt: body.occurredAt.toISOString(),
      description: body.description
    };
  }
  return { captureMode: "link_existing", transactionId: body.transactionId };
}

async function invalidateNetWorthAndDashboard(
  client: ReturnType<typeof useQueryClient>
): Promise<void> {
  await Promise.all([
    client.invalidateQueries({ queryKey: qk.netWorth() }),
    client.invalidateQueries({ queryKey: qk.dashboard() }),
    client.invalidateQueries({ queryKey: qk.monthlyRollups() })
  ]);
}

export function useCreateReceivable(): ReturnType<
  typeof useMutation<ReceivableMutationResult, Error, CreateReceivable>
> {
  const client = useQueryClient();
  const [key, setKey] = useState(generateRequestId);
  return useMutation({
    mutationFn: async (body): Promise<ReceivableMutationResult> => {
      try {
        const result = await apiClient.POST("/v1/receivables", {
          body: serializeCreateReceivable(body),
          params: { header: { "Idempotency-Key": key } }
        });
        if (result.error !== undefined) throw toAppError(result.error, result.response.status);
        const parsed = ReceivableMutationResultSchema.safeParse(result.data);
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
    onSettled: async (_result, _error, body) => {
      await Promise.all([
        client.invalidateQueries({ queryKey: qk.receivables() }),
        body.fundingMode === "lend_now"
          ? Promise.all([
              client.invalidateQueries({ queryKey: qk.accounts() }),
              client.invalidateQueries({ queryKey: qk.transactions() })
            ])
          : Promise.resolve(),
        invalidateNetWorthAndDashboard(client)
      ]);
    }
  });
}

export function useUpdateReceivableMetadata(): ReturnType<
  typeof useMutation<Receivable, Error, MetadataRequest>
> {
  const client = useQueryClient();
  const [key, setKey] = useState(generateRequestId);
  return useMutation({
    mutationFn: async ({ receivableId, body }): Promise<Receivable> => {
      try {
        const result = await apiClient.PATCH("/v1/receivables/{receivableId}", {
          body: {
            ...(body.counterpartyName === undefined
              ? {}
              : { counterpartyName: body.counterpartyName }),
            ...(body.note === undefined ? {} : { note: body.note }),
            ...(body.dueAt === undefined
              ? {}
              : { dueAt: body.dueAt === null ? null : body.dueAt.toISOString() })
          },
          params: { path: { receivableId }, header: { "Idempotency-Key": key } }
        });
        if (result.error !== undefined) throw toAppError(result.error, result.response.status);
        const parsed = ReceivableSchema.safeParse(result.data);
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
    onSettled: async (_result, _error, request) => {
      await Promise.all([
        client.invalidateQueries({ queryKey: qk.receivable(request.receivableId) }),
        client.invalidateQueries({ queryKey: qk.receivables() })
      ]);
    }
  });
}

export function useRecordReceivableRepayment(): ReturnType<
  typeof useMutation<ReceivableMutationResult, Error, RepaymentRequest>
> {
  const client = useQueryClient();
  const [key, setKey] = useState(generateRequestId);
  return useMutation({
    mutationFn: async ({ receivableId, body }): Promise<ReceivableMutationResult> => {
      try {
        const result = await apiClient.POST("/v1/receivables/{receivableId}/repayments", {
          body: serializeRepayment(body),
          params: { path: { receivableId }, header: { "Idempotency-Key": key } }
        });
        if (result.error !== undefined) throw toAppError(result.error, result.response.status);
        const parsed = ReceivableMutationResultSchema.safeParse(result.data);
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
    onSettled: async (_result, _error, request) => {
      await Promise.all([
        client.invalidateQueries({ queryKey: qk.receivables() }),
        request.body.captureMode === "receive_now"
          ? client.invalidateQueries({ queryKey: qk.accounts() })
          : Promise.resolve(),
        client.invalidateQueries({ queryKey: qk.transactions() }),
        invalidateNetWorthAndDashboard(client)
      ]);
    }
  });
}

export function useCreateReceivableCorrection(): ReturnType<
  typeof useMutation<ReceivableMutationResult, Error, CorrectionRequest>
> {
  const client = useQueryClient();
  const [key, setKey] = useState(generateRequestId);
  return useMutation({
    mutationFn: async ({ receivableId, body }): Promise<ReceivableMutationResult> => {
      try {
        const result = await apiClient.POST("/v1/receivables/{receivableId}/corrections", {
          body,
          params: { path: { receivableId }, header: { "Idempotency-Key": key } }
        });
        if (result.error !== undefined) throw toAppError(result.error, result.response.status);
        const parsed = ReceivableMutationResultSchema.safeParse(result.data);
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
        client.invalidateQueries({ queryKey: qk.receivables() }),
        invalidateNetWorthAndDashboard(client)
      ]);
    }
  });
}
