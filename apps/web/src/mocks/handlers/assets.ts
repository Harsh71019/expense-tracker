import type { HttpHandler } from "msw";

import { findAsset, pushValuation } from "../data/store";
import type { ValuationDto } from "../data/store";
import { mockProblem } from "../data/problem";
import type { MockHttp, MockStore } from "./types";

export function assetHandlers(http: MockHttp, store: MockStore): HttpHandler[] {
  return [
    http.get("/v1/assets", ({ response }) => {
      return response(200).json(store.assets);
    }),

    http.post("/v1/assets", async ({ request, response }) => {
      const key = request.headers.get("Idempotency-Key") ?? "";
      const existing = store.idempotency.assets.get(key);
      if (existing !== undefined) {
        return response(200).json(existing, { headers: { "Idempotency-Replayed": "true" } });
      }

      const body = await request.json();
      if (body === undefined) {
        return response(422).json(
          mockProblem(422, "common.validation_failed", "Request body is required.")
        );
      }
      const now = new Date().toISOString();
      const asset = {
        id: store.nextAssetId(),
        userId: store.profile.userId,
        kind: body.kind,
        name: body.name,
        openedAt: body.openedAt,
        ...(body.maturityAt === undefined || body.maturityAt === null
          ? {}
          : { maturityAt: body.maturityAt }),
        ...(body.annualRateBps === undefined ? {} : { annualRateBps: body.annualRateBps }),
        ...(body.quantityMilliUnits === undefined
          ? {}
          : { quantityMilliUnits: body.quantityMilliUnits }),
        isClosed: false,
        createdAt: now,
        updatedAt: now
      };
      store.assets.push(asset);
      pushValuation(store, asset.id, body.openingValueMinor, body.openedAt ?? now);
      store.idempotency.assets.set(key, asset);
      return response(201).json(asset);
    }),

    http.post("/v1/assets/{assetId}/close", ({ params, request, response }) => {
      const key = request.headers.get("Idempotency-Key") ?? "";
      if (store.idempotency.assetClose.has(key)) {
        return response(204).empty({ headers: { "Idempotency-Replayed": "true" } });
      }

      const asset = findAsset(store, params.assetId);
      if (asset === undefined) {
        return response(404).json(mockProblem(404, "common.not_found", "Asset not found."));
      }

      asset.isClosed = true;
      asset.updatedAt = new Date().toISOString();
      store.idempotency.assetClose.add(key);
      return response(204).empty();
    }),

    http.get("/v1/assets/{assetId}/valuations", ({ params, response }) => {
      const items: ValuationDto[] = store.valuations
        .filter((valuation) => valuation.assetId === params.assetId)
        .sort((a, b) => (b.valuedAt ?? "").localeCompare(a.valuedAt ?? ""));
      return response(200).json({
        items,
        pageInfo: { nextCursor: null, hasMore: false, limit: Math.max(items.length, 1) }
      });
    }),

    http.post("/v1/assets/{assetId}/valuations", async ({ params, request, response }) => {
      const key = request.headers.get("Idempotency-Key") ?? "";
      const existing = store.idempotency.valuations.get(key);
      if (existing !== undefined) {
        return response(200).json(existing, { headers: { "Idempotency-Replayed": "true" } });
      }

      const asset = findAsset(store, params.assetId);
      if (asset === undefined) {
        return response(404).json(mockProblem(404, "common.not_found", "Asset not found."));
      }

      const body = await request.json();
      if (body === undefined) {
        return response(422).json(
          mockProblem(422, "common.validation_failed", "Request body is required.")
        );
      }
      const now = new Date().toISOString();
      const valuation: ValuationDto = {
        id: store.nextValuationId(),
        assetId: asset.id,
        userId: store.profile.userId,
        valueMinor: body.valueMinor,
        valuedAt: body.valuedAt,
        source: body.source ?? "manual",
        createdAt: now
      };
      store.valuations.push(valuation);
      store.idempotency.valuations.set(key, valuation);
      return response(201).json(valuation);
    })
  ];
}
