import { Inject, Injectable } from "@nestjs/common";
import { ValuationSchema, type AssetId, type CreateValuation, type Valuation } from "@vyaya/shared";
import { and, desc, eq, inArray } from "drizzle-orm";

import { DATABASE_CONNECTION } from "../common/db/db.module.js";
import type { DrizzleDb } from "../common/db/db.module.js";
import { assetValuations } from "../common/db/schema/index.js";
import type { DbTx } from "../common/db/db-txn.js";

@Injectable()
export class ValuationRepository {
  constructor(@Inject(DATABASE_CONNECTION) private readonly db: DrizzleDb) {}

  async create(
    userId: string,
    assetId: AssetId,
    input: CreateValuation,
    tx: DbTx
  ): Promise<Valuation> {
    const [row] = await tx
      .insert(assetValuations)
      .values({
        userId,
        assetId,
        valueMinor: input.valueMinor,
        valuedAt: input.valuedAt,
        source: input.source,
        createdAt: new Date()
      })
      .returning();
    if (row === undefined) throw new Error("Valuation insert did not return a row.");
    return ValuationSchema.parse(row);
  }

  async listByAsset(userId: string, assetId: AssetId): Promise<Valuation[]> {
    const rows = await this.db
      .select()
      .from(assetValuations)
      .where(and(eq(assetValuations.userId, userId), eq(assetValuations.assetId, assetId)))
      .orderBy(desc(assetValuations.valuedAt), desc(assetValuations.id));
    return rows.map((row) => ValuationSchema.parse(row));
  }

  /**
   * Postgres's `DISTINCT ON` is the idiomatic replacement for Mongo's
   * `$group`-with-`$first`, but the pinned drizzle-orm version (0.45.2) has
   * no `.distinctOn()` query-builder method (checked: absent from
   * pg-core's select builder) -- fall back to an in-memory dedupe over a
   * single ORDER BY query instead. Revisit if drizzle-orm is upgraded.
   */
  async findLatestForAssets(
    userId: string,
    assetIds: readonly AssetId[]
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
