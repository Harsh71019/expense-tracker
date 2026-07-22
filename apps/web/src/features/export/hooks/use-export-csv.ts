"use client";

import { useMutation, type UseMutationResult } from "@tanstack/react-query";
import type { ExportCsvQuery } from "@treasury-ops/shared";
import { z } from "zod";

import { apiClient } from "@/lib/api/client";
import { toAppError, toNetworkError } from "@/lib/api/problem";

export function useExportCsv(): UseMutationResult<string, Error, ExportCsvQuery> {
  return useMutation({
    retry: false,
    mutationFn: async (query): Promise<string> => {
      try {
        const result = await apiClient.GET("/v1/export/csv", {
          params: {
            query: {
              ...(query.from === undefined ? {} : { from: query.from.toISOString() }),
              ...(query.to === undefined ? {} : { to: query.to.toISOString() })
            }
          }
        });
        if (result.error !== undefined) throw toAppError(result.error, result.response.status);
        const parsed = z.string().safeParse(result.data);
        if (!parsed.success) throw toAppError(undefined, result.response.status);
        return parsed.data;
      } catch (error: unknown) {
        if (error instanceof Error) throw error;
        throw toNetworkError(error);
      }
    }
  });
}
