import { Inject, Injectable } from "@nestjs/common";
import { AssetIdSchema, AssetKindSchema, type AssetId } from "@treasury-ops/shared";
import { and, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";

import { DATABASE_CONNECTION } from "../common/db/db.module.js";
import type { DrizzleDb } from "../common/db/db.module.js";
import type { DbTx } from "../common/db/db-txn.js";
import { assets, assetValuations } from "../common/db/schema/index.js";

/**
 * The public, deliberately narrow read surface other modules use to reason
 * about loan-liability assets — currently the declared-debt profile, which
 * derives a linked debt's outstanding amount from the asset's latest valuation
 * rather than keeping a second copy of it.
 *
 * Why a new service rather than extending `AssetService`: `AssetService` owns
 * asset *mutation* orchestration (create, close, add valuation) inside
 * `withTxn`. A cross-module reader needs none of that, and injecting the
 * mutation service into the financial-profile module would hand it write
 * capabilities it must never have. This service is read-only by construction.
 *
 * Nothing here returns a Drizzle row: every result is parsed through
 * `LiabilityAssetReadSchema` before it leaves the assets layer, so a schema
 * change cannot silently reshape another module's input.
 */

export const LiabilityAssetReadSchema = z.object({
  assetId: AssetIdSchema,
  name: z.string().min(1),
  kind: AssetKindSchema,
  isClosed: z.boolean(),
  /**
   * The raw signed valuation. A `loan_liability` is stored negative; callers
   * that want an outstanding amount take its absolute value themselves rather
   * than receiving a pre-massaged number whose sign convention is invisible.
   */
  latestValuationMinor: z.number().int().nullable(),
  latestValuationAt: z.coerce.date().nullable()
});

export type LiabilityAssetRead = z.infer<typeof LiabilityAssetReadSchema>;

/**
 * A three-way outcome rather than a nullable asset: the caller must be able to
 * tell "you do not have that asset" from "that asset is the wrong kind", and
 * the `found` branch can only ever carry an open `loan_liability`.
 */
export type LiabilityAssetLookup =
  | Readonly<{ outcome: "found"; asset: LiabilityAssetRead }>
  | Readonly<{ outcome: "not_found" }>
  | Readonly<{ outcome: "not_loan_liability" }>;

@Injectable()
export class LiabilityAssetReadService {
  constructor(@Inject(DATABASE_CONNECTION) private readonly db: DrizzleDb) {}

  /**
   * Link-time validation. `not_found` covers missing, closed, and
   * another tenant's asset alike — every query below filters by `userId`, so a
   * cross-tenant id is indistinguishable from a nonexistent one.
   */
  async findOpenLoanLiability(
    userId: string,
    assetId: AssetId,
    tx?: DbTx
  ): Promise<LiabilityAssetLookup> {
    const executor = tx ?? this.db;
    const [row] = await executor
      .select({
        assetId: assets.id,
        name: assets.name,
        kind: assets.kind,
        isClosed: assets.isClosed
      })
      .from(assets)
      .where(and(eq(assets.id, assetId), eq(assets.userId, userId), eq(assets.isClosed, false)));
    if (row === undefined) return { outcome: "not_found" };
    if (row.kind !== "loan_liability") return { outcome: "not_loan_liability" };

    const valuation = await this.latestValuation(userId, assetId, executor);
    return {
      outcome: "found",
      asset: LiabilityAssetReadSchema.parse({ ...row, ...valuation })
    };
  }

  /** Every open loan liability the user owns, for a link selector. */
  async listOpenLoanLiabilities(userId: string): Promise<LiabilityAssetRead[]> {
    const rows = await this.db
      .select({
        assetId: assets.id,
        name: assets.name,
        kind: assets.kind,
        isClosed: assets.isClosed
      })
      .from(assets)
      .where(
        and(
          eq(assets.userId, userId),
          eq(assets.isClosed, false),
          eq(assets.kind, "loan_liability")
        )
      )
      .orderBy(assets.name);

    const latest = await this.latestValuations(
      userId,
      rows.map((row) => row.assetId)
    );
    return rows.map((row) =>
      LiabilityAssetReadSchema.parse({
        ...row,
        latestValuationMinor: latest.get(row.assetId)?.valueMinor ?? null,
        latestValuationAt: latest.get(row.assetId)?.valuedAt ?? null
      })
    );
  }

  /**
   * Batch lookup for listing linked debts. Closed assets are included rather
   * than dropped: a debt whose asset was closed after linking is a state the
   * user needs to see, not a row that silently loses its amount.
   */
  async findLoanLiabilitiesByIds(
    userId: string,
    assetIds: readonly AssetId[]
  ): Promise<ReadonlyMap<string, LiabilityAssetRead>> {
    if (assetIds.length === 0) return new Map();

    const rows = await this.db
      .select({
        assetId: assets.id,
        name: assets.name,
        kind: assets.kind,
        isClosed: assets.isClosed
      })
      .from(assets)
      .where(
        and(
          eq(assets.userId, userId),
          eq(assets.kind, "loan_liability"),
          inArray(assets.id, [...assetIds])
        )
      );

    const latest = await this.latestValuations(
      userId,
      rows.map((row) => row.assetId)
    );
    const result = new Map<string, LiabilityAssetRead>();
    for (const row of rows) {
      result.set(
        row.assetId,
        LiabilityAssetReadSchema.parse({
          ...row,
          latestValuationMinor: latest.get(row.assetId)?.valueMinor ?? null,
          latestValuationAt: latest.get(row.assetId)?.valuedAt ?? null
        })
      );
    }
    return result;
  }

  private async latestValuation(
    userId: string,
    assetId: AssetId,
    executor: DrizzleDb | DbTx
  ): Promise<{ latestValuationMinor: number | null; latestValuationAt: Date | null }> {
    const [row] = await executor
      .select({ valueMinor: assetValuations.valueMinor, valuedAt: assetValuations.valuedAt })
      .from(assetValuations)
      .where(and(eq(assetValuations.userId, userId), eq(assetValuations.assetId, assetId)))
      .orderBy(desc(assetValuations.valuedAt), desc(assetValuations.id))
      .limit(1);
    return {
      latestValuationMinor: row?.valueMinor ?? null,
      latestValuationAt: row?.valuedAt ?? null
    };
  }

  /**
   * One ordered query deduped in memory. `DISTINCT ON` would be the idiomatic
   * Postgres answer, but the pinned drizzle-orm (0.45.2) has no
   * `.distinctOn()` builder — see valuation.repository.ts for the same note.
   */
  private async latestValuations(
    userId: string,
    assetIds: readonly string[]
  ): Promise<Map<string, { valueMinor: number; valuedAt: Date }>> {
    if (assetIds.length === 0) return new Map();

    const rows = await this.db
      .select({
        assetId: assetValuations.assetId,
        valueMinor: assetValuations.valueMinor,
        valuedAt: assetValuations.valuedAt
      })
      .from(assetValuations)
      .where(
        and(eq(assetValuations.userId, userId), inArray(assetValuations.assetId, [...assetIds]))
      )
      .orderBy(assetValuations.assetId, desc(assetValuations.valuedAt), desc(assetValuations.id));

    const latest = new Map<string, { valueMinor: number; valuedAt: Date }>();
    for (const row of rows) {
      if (latest.has(row.assetId)) continue;
      latest.set(row.assetId, { valueMinor: row.valueMinor, valuedAt: row.valuedAt });
    }
    return latest;
  }
}
