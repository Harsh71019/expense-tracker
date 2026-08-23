"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AssetMarketValuationDetailsSchema,
  DisposalEstimateResultSchema,
  MarketInstrumentPageSchema,
  type AssetMarketValuationDetails,
  type DisposalEstimateResult,
  type MarketInstrumentPage,
  type MarketInstrumentType
} from "@treasury-ops/shared";

import { apiClient } from "@/lib/api/client";
import { toAppError } from "@/lib/api/problem";
import { qk } from "@/lib/query/keys";
import { generateRequestId } from "@/lib/request-id";

export function useAssetMarketValuation(assetId: string | undefined) {
  return useQuery({
    queryKey:
      assetId !== undefined
        ? qk.assetMarketValuation(assetId)
        : ["asset-market-valuation", "empty"],
    enabled: assetId !== undefined && assetId !== "",
    queryFn: async (): Promise<AssetMarketValuationDetails> => {
      if (assetId === undefined || assetId === "") throw new Error("No asset id provided");
      const result = await apiClient.GET("/v1/assets/{assetId}/market-valuation", {
        params: { path: { assetId } }
      });
      if (result.error !== undefined) throw toAppError(result.error, result.response.status);
      return AssetMarketValuationDetailsSchema.parse(result.data);
    }
  });
}

export function useRefreshMarketQuote() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (assetId: string): Promise<AssetMarketValuationDetails> => {
      const idempotencyKey = generateRequestId();
      const result = await apiClient.POST("/v1/assets/{assetId}/market-refreshes", {
        params: {
          path: { assetId },
          header: { "Idempotency-Key": idempotencyKey }
        }
      });
      if (result.error !== undefined) throw toAppError(result.error, result.response.status);
      return AssetMarketValuationDetailsSchema.parse(result.data);
    },
    onSuccess: (data) => {
      void queryClient.invalidateQueries({ queryKey: qk.assetMarketValuation(data.assetId) });
      void queryClient.invalidateQueries({ queryKey: qk.asset(data.assetId) });
      void queryClient.invalidateQueries({ queryKey: qk.assets() });
    }
  });
}

export function useEstimateDisposal(assetId: string) {
  return useMutation({
    mutationFn: async (request: {
      quantityMicroUnits?: number;
      disposalDate?: Date;
      quoteOverrideMicroRupeesPerUnit?: number;
      expectedOtherChargesMinor?: number;
    }): Promise<DisposalEstimateResult> => {
      const idempotencyKey = generateRequestId();
      const result = await apiClient.POST("/v1/assets/{assetId}/disposal-estimates", {
        params: {
          path: { assetId },
          header: { "Idempotency-Key": idempotencyKey }
        },
        body: {
          ...(request.quantityMicroUnits !== undefined
            ? { quantityMicroUnits: request.quantityMicroUnits }
            : {}),
          ...(request.disposalDate !== undefined
            ? { disposalDate: request.disposalDate.toISOString() }
            : {}),
          ...(request.quoteOverrideMicroRupeesPerUnit !== undefined
            ? { quoteOverrideMicroRupeesPerUnit: request.quoteOverrideMicroRupeesPerUnit }
            : {}),
          ...(request.expectedOtherChargesMinor !== undefined
            ? { expectedOtherChargesMinor: request.expectedOtherChargesMinor }
            : {})
        }
      });
      if (result.error !== undefined) throw toAppError(result.error, result.response.status);
      return DisposalEstimateResultSchema.parse(result.data);
    }
  });
}

export function useInstrumentSearch(type?: MarketInstrumentType, query?: string) {
  return useQuery({
    queryKey: qk.instrumentSearch(type, query),
    queryFn: async (): Promise<MarketInstrumentPage> => {
      const result = await apiClient.GET("/v1/assets/instruments", {
        params: {
          query: {
            ...(type !== undefined ? { type } : {}),
            ...(query !== undefined && query.trim().length > 0 ? { q: query.trim() } : {}),
            limit: 50
          }
        }
      });
      if (result.error !== undefined) throw toAppError(result.error, result.response.status);
      return MarketInstrumentPageSchema.parse(result.data);
    }
  });
}
