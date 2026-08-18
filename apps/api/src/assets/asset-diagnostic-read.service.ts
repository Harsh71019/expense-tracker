import { Inject, Injectable } from "@nestjs/common";
import { ASSET_VALUATION_FRESHNESS_DAYS, AssetKindSchema } from "@treasury-ops/shared";
import { and, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";

import { DATABASE_CONNECTION } from "../common/db/db.module.js";
import type { DrizzleDb } from "../common/db/db.module.js";
import { assets, assetValuations } from "../common/db/schema/index.js";

export const AssetDiagnosticFactsSchema = z.object({
  activeAssetCount: z.number().int().min(0),
  missingValuationCount: z.number().int().min(0),
  staleValuationCount: z.number().int().min(0),
  latestValuationAt: z.coerce.date().nullable(),
  hasActiveAssets: z.boolean(),
  lastUpdatedAt: z.coerce.date().nullable()
});

export type AssetDiagnosticFacts = z.infer<typeof AssetDiagnosticFactsSchema>;

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

export function getValuationFreshnessThresholdDays(kind: string): number {
  const parsed = AssetKindSchema.safeParse(kind);
  if (parsed.success) {
    const val = ASSET_VALUATION_FRESHNESS_DAYS[parsed.data];
    if (val !== undefined) {
      return val;
    }
  }
  return ASSET_VALUATION_FRESHNESS_DAYS.default;
}

/**
 * Tenant-scoped narrow read port for asset and valuation facts consumed by the
 * financial readiness diagnostic.
 *
 * Performance requirement (CLAUDE.md):
 * - Two single bounded queries, no per-asset query loop, zero N+1 behavior.
 * - Deduplication of latest valuations in memory.
 * - Returns aggregate counts and dates only; never returns valuation amounts.
 */
@Injectable()
export class AssetDiagnosticReadService {
  constructor(@Inject(DATABASE_CONNECTION) private readonly db: DrizzleDb) {}

  async getAssetDiagnosticFacts(
    userId: string,
    asOf: Date = new Date()
  ): Promise<AssetDiagnosticFacts> {
    const activeAssets = await this.db
      .select({
        id: assets.id,
        kind: assets.kind,
        updatedAt: assets.updatedAt,
        createdAt: assets.createdAt
      })
      .from(assets)
      .where(and(eq(assets.userId, userId), eq(assets.isClosed, false)))
      .orderBy(desc(assets.updatedAt));

    const activeAssetCount = activeAssets.length;
    if (activeAssetCount === 0) {
      return AssetDiagnosticFactsSchema.parse({
        activeAssetCount: 0,
        missingValuationCount: 0,
        staleValuationCount: 0,
        latestValuationAt: null,
        hasActiveAssets: false,
        lastUpdatedAt: null
      });
    }

    const assetIds = activeAssets.map((a) => a.id);

    const valuationRows = await this.db
      .select({
        assetId: assetValuations.assetId,
        valuedAt: assetValuations.valuedAt
      })
      .from(assetValuations)
      .where(and(eq(assetValuations.userId, userId), inArray(assetValuations.assetId, assetIds)))
      .orderBy(assetValuations.assetId, desc(assetValuations.valuedAt), desc(assetValuations.id));

    const latestValuations = new Map<string, Date>();
    for (const row of valuationRows) {
      if (!latestValuations.has(row.assetId)) {
        latestValuations.set(row.assetId, row.valuedAt);
      }
    }

    let missingValuationCount = 0;
    let staleValuationCount = 0;
    let latestValuationAt: Date | null = null;
    let latestTimestamp: Date | null = null;

    for (const asset of activeAssets) {
      const assetTs = asset.updatedAt ?? asset.createdAt;
      if (assetTs && (latestTimestamp === null || assetTs > latestTimestamp)) {
        latestTimestamp = assetTs;
      }

      const valuedAt = latestValuations.get(asset.id);
      if (valuedAt === undefined) {
        missingValuationCount += 1;
      } else {
        if (latestValuationAt === null || valuedAt > latestValuationAt) {
          latestValuationAt = valuedAt;
        }
        if (latestTimestamp === null || valuedAt > latestTimestamp) {
          latestTimestamp = valuedAt;
        }

        const ageDays = Math.floor((asOf.getTime() - valuedAt.getTime()) / ONE_DAY_MS);
        const thresholdDays = getValuationFreshnessThresholdDays(asset.kind);
        if (ageDays > thresholdDays) {
          staleValuationCount += 1;
        }
      }
    }

    return AssetDiagnosticFactsSchema.parse({
      activeAssetCount,
      missingValuationCount,
      staleValuationCount,
      latestValuationAt,
      hasActiveAssets: activeAssetCount > 0,
      lastUpdatedAt: latestTimestamp
    });
  }
}
