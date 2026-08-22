import { Inject, Injectable } from "@nestjs/common";
import {
  AssetFundingSchema,
  type AssetFunding,
  type AssetFundingId,
  type AssetId,
  type TransactionId
} from "@treasury-ops/shared";
import { and, desc, eq } from "drizzle-orm";

import { DATABASE_CONNECTION } from "../common/db/db.module.js";
import type { DrizzleDb } from "../common/db/db.module.js";
import type { DbTx } from "../common/db/db-txn.js";
import { assetFundings } from "../common/db/schema/index.js";
import { stripNulls } from "../common/db/strip-nulls.js";

export type CreateAssetFunding = Readonly<{
  assetId: AssetId;
  transactionId: TransactionId;
  amountMinor: number;
  occurredAt: Date;
}>;

@Injectable()
export class AssetFundingRepository {
  constructor(@Inject(DATABASE_CONNECTION) private readonly db: DrizzleDb) {}

  async create(userId: string, input: CreateAssetFunding, tx: DbTx): Promise<AssetFunding> {
    const [row] = await tx
      .insert(assetFundings)
      .values({ ...input, userId, status: "posted", createdAt: new Date() })
      .returning();
    if (row === undefined) throw new Error("Asset funding insert did not return a row.");
    return toAssetFunding(row);
  }

  async findById(
    userId: string,
    fundingId: AssetFundingId,
    tx?: DbTx
  ): Promise<AssetFunding | null> {
    const executor = tx ?? this.db;
    const [row] = await executor
      .select()
      .from(assetFundings)
      .where(and(eq(assetFundings.userId, userId), eq(assetFundings.id, fundingId)));
    return row === undefined ? null : toAssetFunding(row);
  }

  async findByIdForUpdate(
    userId: string,
    fundingId: AssetFundingId,
    tx: DbTx
  ): Promise<AssetFunding | null> {
    const [row] = await tx
      .select()
      .from(assetFundings)
      .where(and(eq(assetFundings.userId, userId), eq(assetFundings.id, fundingId)))
      .for("update");
    return row === undefined ? null : toAssetFunding(row);
  }

  async findActiveByTransactionId(
    userId: string,
    transactionId: TransactionId,
    tx: DbTx
  ): Promise<AssetFunding | null> {
    const [row] = await tx
      .select()
      .from(assetFundings)
      .where(
        and(
          eq(assetFundings.userId, userId),
          eq(assetFundings.transactionId, transactionId),
          eq(assetFundings.status, "posted")
        )
      )
      .for("update");
    return row === undefined ? null : toAssetFunding(row);
  }

  async createReversal(userId: string, original: AssetFunding, tx: DbTx): Promise<AssetFunding> {
    const [row] = await tx
      .insert(assetFundings)
      .values({
        userId,
        assetId: original.assetId,
        transactionId: original.transactionId,
        amountMinor: original.amountMinor,
        occurredAt: original.occurredAt,
        status: "reversal",
        reversalOf: original.id,
        createdAt: new Date()
      })
      .returning();
    if (row === undefined) throw new Error("Asset funding reversal insert did not return a row.");
    return toAssetFunding(row);
  }

  async markReversed(
    userId: string,
    fundingId: AssetFundingId,
    reversalId: AssetFundingId,
    tx: DbTx
  ): Promise<AssetFunding | null> {
    const [row] = await tx
      .update(assetFundings)
      .set({ status: "reversed", reversedBy: reversalId })
      .where(
        and(
          eq(assetFundings.userId, userId),
          eq(assetFundings.id, fundingId),
          eq(assetFundings.status, "posted")
        )
      )
      .returning();
    return row === undefined ? null : toAssetFunding(row);
  }

  async listByAsset(userId: string, assetId: AssetId, limit: number): Promise<AssetFunding[]> {
    const rows = await this.db
      .select()
      .from(assetFundings)
      .where(and(eq(assetFundings.userId, userId), eq(assetFundings.assetId, assetId)))
      .orderBy(desc(assetFundings.occurredAt), desc(assetFundings.id))
      .limit(limit);
    return rows.map(toAssetFunding);
  }
}

function toAssetFunding(row: typeof assetFundings.$inferSelect): AssetFunding {
  return AssetFundingSchema.parse(stripNulls(row));
}
