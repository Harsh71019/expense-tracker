"use client";

import {
  useInfiniteQuery,
  useMutation,
  useQueryClient,
  type InfiniteData,
  type UseInfiniteQueryResult,
  type UseMutationResult
} from "@tanstack/react-query";
import {
  BillStatementRowPageSchema,
  BillStatementUploadSchema,
  type BillStatementRowMatchStatus,
  type BillStatementRowPage,
  type BillStatementUpload,
  type ColumnMapping
} from "@treasury-ops/shared";
import { useState } from "react";

import { apiClient } from "@/lib/api/client";
import { toAppError, toNetworkError } from "@/lib/api/problem";
import { qk } from "@/lib/query/keys";
import { generateRequestId } from "@/lib/request-id";

export type StatementRowFilters = Readonly<{
  matchStatus?: BillStatementRowMatchStatus;
  acknowledged?: boolean;
  limit: number;
}>;

type UploadStatementRequest = Readonly<{ file: File; mapping: ColumnMapping }>;

export function useUploadBillStatement(
  billId: string
): UseMutationResult<BillStatementUpload, Error, UploadStatementRequest> {
  const client = useQueryClient();
  const [key, setKey] = useState(generateRequestId);
  return useMutation({
    mutationFn: async ({ file, mapping }): Promise<BillStatementUpload> => {
      const form = new FormData();
      form.append("file", file);
      form.append("mapping", JSON.stringify(mapping));
      try {
        const result = await apiClient.POST("/v1/bills/{billId}/statement", {
          params: { path: { billId }, header: { "Idempotency-Key": key } },
          body: { file: "", mapping: JSON.stringify(mapping) },
          bodySerializer: () => form
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
    onSettled: async () => {
      await Promise.all([
        client.invalidateQueries({ queryKey: qk.billDetail(billId) }),
        client.invalidateQueries({
          queryKey: [...qk.billDetail(billId), "statement-rows"]
        })
      ]);
    }
  });
}

export function useBillStatementRows(
  billId: string,
  filters: StatementRowFilters,
  enabled: boolean
): UseInfiniteQueryResult<InfiniteData<BillStatementRowPage, string | null>, Error> {
  const initialCursor: string | null = null;
  return useInfiniteQuery<
    BillStatementRowPage,
    Error,
    InfiniteData<BillStatementRowPage, string | null>,
    ReturnType<typeof qk.billStatementRows>,
    string | null
  >({
    queryKey: qk.billStatementRows(billId, filters),
    initialPageParam: initialCursor,
    enabled,
    queryFn: async ({ pageParam }): Promise<BillStatementRowPage> => {
      try {
        const result = await apiClient.GET("/v1/bills/{billId}/statement/rows", {
          params: {
            path: { billId },
            query: {
              ...(filters.matchStatus === undefined ? {} : { matchStatus: filters.matchStatus }),
              ...(filters.acknowledged === undefined ? {} : { acknowledged: filters.acknowledged }),
              ...(pageParam === null ? {} : { cursor: pageParam }),
              limit: filters.limit
            }
          }
        });
        if (result.error !== undefined) throw toAppError(result.error, result.response.status);
        const parsed = BillStatementRowPageSchema.safeParse(result.data);
        if (!parsed.success) throw toAppError(undefined, result.response.status);
        return parsed.data;
      } catch (error: unknown) {
        if (error instanceof Error) throw error;
        throw toNetworkError(error);
      }
    },
    getNextPageParam: (page) => (page.pageInfo.hasMore ? page.pageInfo.nextCursor : undefined)
  });
}
