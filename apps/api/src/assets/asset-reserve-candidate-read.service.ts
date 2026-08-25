import { Inject, Injectable } from "@nestjs/common";
import {
  ASSET_VALUATION_FRESHNESS_DAYS,
  AssetKindSchema,
  type AssetKind
} from "@treasury-ops/shared";
import { and, desc, eq, inArray, lte, sql } from "drizzle-orm";

import { DATABASE_CONNECTION } from "../common/db/db.module.js";
import type { DrizzleDb } from "../common/db/db.module.js";
import { assets, assetValuations, receivables } from "../common/db/schema/index.js";

export interface AssetReserveCandidate {
  readonly assetId: string;
  readonly name: string;
  readonly kind: AssetKind;
  readonly isClosed: boolean;
  readonly currentValueMinor: number | null;
  readonly valuedAt: Date | null;
  readonly freshnessThresholdDays: number;
  readonly lastUpdatedAt: Date | null;
}

/**
 * The freshness threshold for a given asset kind, single-sourced from the
 * shared `ASSET_VALUATION_FRESHNESS_DAYS` table used by the financial
 * readiness diagnostic -- see
 * `apps/api/src/assets/asset-diagnostic-read.service.ts` for the sibling
 * lookup this deliberately mirrors rather than duplicates the table itself.
 */
function freshnessThresholdDaysFor(kind: string): number {
  const parsed = AssetKindSchema.safeParse(kind);
  if (parsed.success) {
    const value = ASSET_VALUATION_FRESHNESS_DAYS[parsed.data];
    if (value !== undefined) return value;
  }
  return ASSET_VALUATION_FRESHNESS_DAYS.default;
}

/**
 * Tenant-scoped narrow read port for asset facts consumed by reserve source
 * evaluation. Every asset the user owns is returned (open and closed alike)
 * so the reserve source manager can show a closed asset as unavailable
 * rather than silently dropping it -- excluding only the legacy
 * `loan_receivable` assets backfilled into the receivables sub-ledger, which
 * are not classifiable here (see `AssetRepository.list` for the same
 * exclusion). Read-only; never mutates a valuation or asset row.
 */
@Injectable()
export class AssetReserveCandidateReadService {
  constructor(@Inject(DATABASE_CONNECTION) private readonly db: DrizzleDb) {}

  async listCandidates(userId: string, asOf: Date): Promise<AssetReserveCandidate[]> {
    const rows = await this.db
      .select({
        id: assets.id,
        name: assets.name,
        kind: assets.kind,
        isClosed: assets.isClosed,
        updatedAt: assets.updatedAt,
        createdAt: assets.createdAt
      })
      .from(assets)
      .where(
        and(
          eq(assets.userId, userId),
          sql`not exists (select 1 from ${receivables} where ${receivables.legacyAssetId} = ${assets.id})`
        )
      )
      .orderBy(assets.name);

    if (rows.length === 0) return [];

    const assetIds = rows.map((row) => row.id);
    const valuationRows = await this.db
      .select({
        assetId: assetValuations.assetId,
        valueMinor: assetValuations.valueMinor,
        valuedAt: assetValuations.valuedAt
      })
      .from(assetValuations)
      .where(
        and(
          eq(assetValuations.userId, userId),
          inArray(assetValuations.assetId, assetIds),
          lte(assetValuations.valuedAt, asOf)
        )
      )
      .orderBy(assetValuations.assetId, desc(assetValuations.valuedAt), desc(assetValuations.id));

    const latest = new Map<string, { valueMinor: number; valuedAt: Date }>();
    for (const row of valuationRows) {
      if (latest.has(row.assetId)) continue;
      latest.set(row.assetId, { valueMinor: row.valueMinor, valuedAt: row.valuedAt });
    }

    return rows.map((row) => {
      const valuation = latest.get(row.id) ?? null;
      return {
        assetId: row.id,
        name: row.name,
        kind: row.kind,
        isClosed: row.isClosed,
        currentValueMinor: valuation?.valueMinor ?? null,
        valuedAt: valuation?.valuedAt ?? null,
        freshnessThresholdDays: freshnessThresholdDaysFor(row.kind),
        lastUpdatedAt: row.updatedAt ?? row.createdAt ?? null
      };
    });
  }

  /** Single-asset lookup used by reserve source classification writes -- `null` if missing or owned by another tenant. */
  async getCandidate(
    userId: string,
    assetId: string,
    asOf: Date
  ): Promise<AssetReserveCandidate | null> {
    const [row] = await this.db
      .select({
        id: assets.id,
        name: assets.name,
        kind: assets.kind,
        isClosed: assets.isClosed,
        updatedAt: assets.updatedAt,
        createdAt: assets.createdAt
      })
      .from(assets)
      .where(and(eq(assets.userId, userId), eq(assets.id, assetId)));
    if (row === undefined) return null;

    const [valuation] = await this.db
      .select({ valueMinor: assetValuations.valueMinor, valuedAt: assetValuations.valuedAt })
      .from(assetValuations)
      .where(
        and(
          eq(assetValuations.userId, userId),
          eq(assetValuations.assetId, assetId),
          lte(assetValuations.valuedAt, asOf)
        )
      )
      .orderBy(desc(assetValuations.valuedAt), desc(assetValuations.id))
      .limit(1);

    return {
      assetId: row.id,
      name: row.name,
      kind: row.kind,
      isClosed: row.isClosed,
      currentValueMinor: valuation?.valueMinor ?? null,
      valuedAt: valuation?.valuedAt ?? null,
      freshnessThresholdDays: freshnessThresholdDaysFor(row.kind),
      lastUpdatedAt: row.updatedAt ?? row.createdAt ?? null
    };
  }
}
