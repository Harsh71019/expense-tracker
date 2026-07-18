import { Inject, Injectable } from "@nestjs/common";
import { AssetSchema, type Asset, type AssetId, type CreateAsset } from "@vyaya/shared";
import { and, eq } from "drizzle-orm";

import { DATABASE_CONNECTION } from "../common/db/db.module.js";
import type { DrizzleDb } from "../common/db/db.module.js";
import { assets } from "../common/db/schema/index.js";
import { stripNulls } from "../common/db/strip-nulls.js";
import type { DbTx } from "../common/db/db-txn.js";

@Injectable()
export class AssetRepository {
  constructor(@Inject(DATABASE_CONNECTION) private readonly db: DrizzleDb) {}

  async create(userId: string, input: CreateAsset, tx: DbTx): Promise<Asset> {
    const now = new Date();
    const [row] = await tx
      .insert(assets)
      .values({
        userId,
        kind: input.kind,
        name: input.name,
        openedAt: input.openedAt,
        maturityAt: input.maturityAt ?? null,
        annualRateBps: input.annualRateBps ?? null,
        quantityMilliUnits: input.quantityMilliUnits ?? null,
        isClosed: false,
        createdAt: now,
        updatedAt: now
      })
      .returning();
    if (row === undefined) throw new Error("Asset insert did not return a row.");
    return AssetSchema.parse(stripNulls(row));
  }

  async list(userId: string): Promise<Asset[]> {
    const rows = await this.db
      .select()
      .from(assets)
      .where(and(eq(assets.userId, userId), eq(assets.isClosed, false)))
      .orderBy(assets.name);
    return rows.map((row) => AssetSchema.parse(stripNulls(row)));
  }

  async findOpenById(userId: string, assetId: AssetId, tx: DbTx): Promise<Asset | null> {
    const [row] = await tx
      .select()
      .from(assets)
      .where(and(eq(assets.id, assetId), eq(assets.userId, userId), eq(assets.isClosed, false)));
    return row === undefined ? null : AssetSchema.parse(stripNulls(row));
  }

  async close(userId: string, assetId: AssetId, tx: DbTx): Promise<boolean> {
    const rows = await tx
      .update(assets)
      .set({ isClosed: true, updatedAt: new Date() })
      .where(and(eq(assets.id, assetId), eq(assets.userId, userId), eq(assets.isClosed, false)))
      .returning({ id: assets.id });
    return rows.length === 1;
  }
}
