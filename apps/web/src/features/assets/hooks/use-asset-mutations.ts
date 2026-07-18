"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  AssetSchema,
  ValuationSchema,
  type Asset,
  type CreateAsset,
  type CreateValuation,
  type Valuation
} from "@vyaya/shared";
import { useState } from "react";

import { apiClient } from "@/lib/api/client";
import { toAppError, toNetworkError } from "@/lib/api/problem";
import { qk } from "@/lib/query/keys";
import { generateRequestId } from "@/lib/request-id";

type ValuationRequest = Readonly<{ assetId: string; body: CreateValuation }>;

export function useCreateAsset(): ReturnType<typeof useMutation<Asset, Error, CreateAsset>> {
  const client = useQueryClient();
  const [key, setKey] = useState(generateRequestId);
  return useMutation({
    mutationFn: async (body): Promise<Asset> => {
      try {
        const result = await apiClient.POST("/v1/assets", {
          body: {
            kind: body.kind,
            name: body.name,
            openedAt: body.openedAt.toISOString(),
            openingValueMinor: body.openingValueMinor,
            ...(body.maturityAt === undefined ? {} : { maturityAt: body.maturityAt.toISOString() }),
            ...(body.annualRateBps === undefined ? {} : { annualRateBps: body.annualRateBps }),
            ...(body.quantityMilliUnits === undefined
              ? {}
              : { quantityMilliUnits: body.quantityMilliUnits })
          },
          params: { header: { "Idempotency-Key": key } }
        });
        if (result.error !== undefined) throw toAppError(result.error, result.response.status);
        const parsed = AssetSchema.safeParse(result.data);
        if (!parsed.success) throw toAppError(undefined, result.response.status);
        return parsed.data;
      } catch (error: unknown) {
        if (error instanceof Error) throw error;
        throw toNetworkError(error);
      }
    },
    onSuccess: async (asset) => {
      setKey(generateRequestId());
      await Promise.all([
        client.invalidateQueries({ queryKey: qk.assets() }),
        client.invalidateQueries({ queryKey: qk.assetValuations(asset.id) }),
        client.invalidateQueries({ queryKey: qk.netWorth() })
      ]);
    }
  });
}

export function useCreateValuation(): ReturnType<
  typeof useMutation<Valuation, Error, ValuationRequest>
> {
  const client = useQueryClient();
  const [key, setKey] = useState(generateRequestId);
  return useMutation({
    mutationFn: async ({ assetId, body }): Promise<Valuation> => {
      try {
        const result = await apiClient.POST("/v1/assets/{assetId}/valuations", {
          body: {
            valueMinor: body.valueMinor,
            valuedAt: body.valuedAt.toISOString(),
            source: body.source
          },
          params: { path: { assetId }, header: { "Idempotency-Key": key } }
        });
        if (result.error !== undefined) throw toAppError(result.error, result.response.status);
        const parsed = ValuationSchema.safeParse(result.data);
        if (!parsed.success) throw toAppError(undefined, result.response.status);
        return parsed.data;
      } catch (error: unknown) {
        if (error instanceof Error) throw error;
        throw toNetworkError(error);
      }
    },
    onSuccess: async (valuation) => {
      setKey(generateRequestId());
      await Promise.all([
        client.invalidateQueries({ queryKey: qk.assetValuations(valuation.assetId) }),
        client.invalidateQueries({ queryKey: qk.netWorth() })
      ]);
    }
  });
}

export function useCloseAsset(): ReturnType<typeof useMutation<void, Error, string>> {
  const client = useQueryClient();
  const [key, setKey] = useState(generateRequestId);
  return useMutation({
    mutationFn: async (assetId): Promise<void> => {
      try {
        const result = await apiClient.POST("/v1/assets/{assetId}/close", {
          params: { path: { assetId }, header: { "Idempotency-Key": key } }
        });
        if (result.error !== undefined) throw toAppError(result.error, result.response.status);
      } catch (error: unknown) {
        if (error instanceof Error) throw error;
        throw toNetworkError(error);
      }
    },
    onSuccess: async () => {
      setKey(generateRequestId());
      await Promise.all([
        client.invalidateQueries({ queryKey: qk.assets() }),
        client.invalidateQueries({ queryKey: qk.netWorth() })
      ]);
    }
  });
}
