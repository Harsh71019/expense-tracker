"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  PortfolioImportBatchCommitResultSchema,
  PortfolioImportBatchSchema,
  PortfolioImportRowPageSchema,
  type PortfolioImportBatch,
  type PortfolioImportRowPage,
  type UpdatePortfolioImportRow,
  type UploadPortfolioImportMetadata
} from "@treasury-ops/shared";
import { z } from "zod";

import { apiClient } from "@/lib/api/client";
import { toAppError } from "@/lib/api/problem";
import { qk } from "@/lib/query/keys";
import { generateRequestId } from "@/lib/request-id";

const BatchesSchema = z.array(PortfolioImportBatchSchema);

export function usePortfolioImportBatches() {
  return useQuery({
    queryKey: qk.portfolioImportBatches(),
    queryFn: async (): Promise<PortfolioImportBatch[]> => {
      const result = await apiClient.GET("/v1/portfolio-imports");
      if (result.error !== undefined) throw toAppError(result.error, result.response.status);
      return BatchesSchema.parse(result.data);
    }
  });
}

export function usePortfolioImportBatch(batchId: string | undefined) {
  return useQuery({
    queryKey:
      batchId !== undefined
        ? qk.portfolioImportBatch(batchId)
        : ["portfolio-import-batches", "empty"],
    enabled: batchId !== undefined && batchId !== "",
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      if (
        status === "queued" ||
        status === "parsing" ||
        status === "committing" ||
        status === "reverting"
      ) {
        return 2000;
      }
      return false;
    },
    queryFn: async (): Promise<PortfolioImportBatch> => {
      if (batchId === undefined || batchId === "") {
        throw new Error("No batch id provided");
      }
      const result = await apiClient.GET("/v1/portfolio-imports/{batchId}", {
        params: { path: { batchId } }
      });
      if (result.error !== undefined) throw toAppError(result.error, result.response.status);
      return PortfolioImportBatchSchema.parse(result.data);
    }
  });
}

export function usePortfolioImportRows(batchId: string | undefined, cursor?: string, limit = 50) {
  return useQuery({
    queryKey:
      batchId !== undefined
        ? qk.portfolioImportRows(batchId, { ...(cursor !== undefined ? { cursor } : {}), limit })
        : ["portfolio-import-rows", "empty"],
    enabled: batchId !== undefined && batchId !== "",
    queryFn: async (): Promise<PortfolioImportRowPage> => {
      if (batchId === undefined || batchId === "") {
        throw new Error("No batch id provided");
      }
      const result = await apiClient.GET("/v1/portfolio-imports/{batchId}/rows", {
        params: {
          path: { batchId },
          query: { ...(cursor !== undefined ? { cursor } : {}), limit }
        }
      });
      if (result.error !== undefined) throw toAppError(result.error, result.response.status);
      return PortfolioImportRowPageSchema.parse(result.data);
    }
  });
}

export function useUploadPortfolioImport() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      file,
      metadata
    }: {
      file: File;
      metadata: UploadPortfolioImportMetadata;
    }): Promise<PortfolioImportBatch> => {
      const formData = new FormData();
      formData.append("file", file);
      if (metadata.password !== undefined && metadata.password.trim().length > 0) {
        formData.append("password", metadata.password);
      }
      if (metadata.source !== undefined) {
        formData.append("source", metadata.source);
      }

      const idempotencyKey = generateRequestId();
      const response = await fetch("/api/v1/portfolio-imports/cas", {
        method: "POST",
        headers: {
          "Idempotency-Key": idempotencyKey
        },
        body: formData
      });

      if (!response.ok) {
        let errorJson: unknown = {};
        try {
          errorJson = await response.json();
        } catch {
          errorJson = {};
        }
        throw toAppError(errorJson, response.status);
      }

      const data: unknown = await response.json();
      return PortfolioImportBatchSchema.parse(data);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: qk.portfolioImportBatches() });
    }
  });
}

export function useUpdatePortfolioImportRow() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      batchId,
      rowId,
      update
    }: {
      batchId: string;
      rowId: string;
      update: UpdatePortfolioImportRow;
    }) => {
      const body: {
        proposedAssetId?: string | null;
        proposedAction?: "create_asset" | "append_event" | "reconcile" | "ignore";
        include?: boolean;
      } = {};
      if (update.proposedAssetId !== undefined) {
        body.proposedAssetId = update.proposedAssetId;
      }
      if (update.proposedAction !== undefined) {
        body.proposedAction = update.proposedAction;
      }
      if (update.include !== undefined) {
        body.include = update.include;
      }

      const result = await apiClient.PATCH("/v1/portfolio-imports/{batchId}/rows/{rowId}", {
        params: { path: { batchId, rowId } },
        body
      });
      if (result.error !== undefined) throw toAppError(result.error, result.response.status);
      return result.data;
    },
    onSuccess: (_, variables) => {
      void queryClient.invalidateQueries({
        queryKey: ["portfolio-import-rows", variables.batchId]
      });
      void queryClient.invalidateQueries({
        queryKey: qk.portfolioImportBatch(variables.batchId)
      });
    }
  });
}

export function useCommitPortfolioImportBatch() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (batchId: string): Promise<PortfolioImportBatch> => {
      const idempotencyKey = generateRequestId();
      const result = await apiClient.POST("/v1/portfolio-imports/{batchId}/commit", {
        params: {
          path: { batchId },
          header: { "Idempotency-Key": idempotencyKey }
        }
      });
      if (result.error !== undefined) throw toAppError(result.error, result.response.status);
      const parsed = PortfolioImportBatchCommitResultSchema.parse(result.data);
      return parsed.batch;
    },
    onSuccess: (data) => {
      void queryClient.invalidateQueries({ queryKey: qk.portfolioImportBatches() });
      void queryClient.invalidateQueries({ queryKey: qk.portfolioImportBatch(data.id) });
      void queryClient.invalidateQueries({ queryKey: qk.assets() });
      void queryClient.invalidateQueries({ queryKey: qk.netWorth() });
    }
  });
}

export function useRevertPortfolioImportBatch() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (batchId: string): Promise<PortfolioImportBatch> => {
      const idempotencyKey = generateRequestId();
      const result = await apiClient.POST("/v1/portfolio-imports/{batchId}/revert", {
        params: {
          path: { batchId },
          header: { "Idempotency-Key": idempotencyKey }
        }
      });
      if (result.error !== undefined) throw toAppError(result.error, result.response.status);
      return PortfolioImportBatchSchema.parse(result.data);
    },
    onSuccess: (data) => {
      void queryClient.invalidateQueries({ queryKey: qk.portfolioImportBatches() });
      void queryClient.invalidateQueries({ queryKey: qk.portfolioImportBatch(data.id) });
      void queryClient.invalidateQueries({ queryKey: qk.assets() });
      void queryClient.invalidateQueries({ queryKey: qk.netWorth() });
    }
  });
}
