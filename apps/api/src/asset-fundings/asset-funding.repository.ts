import { Inject, Injectable } from "@nestjs/common";
import {
  AssetFundingIdSchema,
  AssetFundingSchema,
  type AssetFunding,
  type AssetFundingPage,
  type AssetFundingId,
  type AssetId,
  type ListAssetFundingsQuery,
  type TransactionId
} from "@treasury-ops/shared";
import { and, desc, eq, inArray, lt, or } from "drizzle-orm";
import { z } from "zod";

import { DATABASE_CONNECTION } from "../common/db/db.module.js";
import type { DrizzleDb } from "../common/db/db.module.js";
import type { DbTx } from "../common/db/db-txn.js";
import { assetFundings } from "../common/db/schema/index.js";
import { transactions } from "../common/db/schema/index.js";
import { assets } from "../common/db/schema/index.js";
import { isActiveAssetFunding } from "../common/db/asset-funding-active.js";
import { decodeCursorPayload, encodeCursorPayload } from "../common/pagination/cursor.js";
import { stripNulls } from "../common/db/strip-nulls.js";

export type CreateAssetFunding = Readonly<{
  assetId: AssetId;
  transactionId: TransactionId;
  amountMinor: number;
  occurredAt: Date;
}>;

const CursorPayloadSchema = z.object({
  occurredAt: z.string().datetime(),
  id: AssetFundingIdSchema
});

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

  async findPageByAsset(
    userId: string,
    assetId: AssetId,
    query: ListAssetFundingsQuery
  ): Promise<AssetFundingPage> {
    const cursor = query.cursor === undefined ? null : decodeCursor(query.cursor);
    const rows = await this.db
      .select()
      .from(assetFundings)
      .where(
        and(
          eq(assetFundings.userId, userId),
          eq(assetFundings.assetId, assetId),
          ...(cursor === null
            ? []
            : [
                or(
                  lt(assetFundings.occurredAt, cursor.occurredAt),
                  and(
                    eq(assetFundings.occurredAt, cursor.occurredAt),
                    lt(assetFundings.id, cursor.id)
                  )
                )
              ])
        )
      )
      .orderBy(desc(assetFundings.occurredAt), desc(assetFundings.id))
      .limit(query.limit + 1);
    const page = rows.slice(0, query.limit).map(toAssetFunding);
    const last = page.at(-1);
    return {
      items: page,
      pageInfo: {
        nextCursor: rows.length > query.limit && last !== undefined ? encodeCursor(last) : null,
        hasMore: rows.length > query.limit,
        limit: query.limit
      }
    };
  }

  async listActiveForAssets(
    userId: string,
    assetIds: readonly AssetId[]
  ): Promise<ReadonlyArray<Readonly<{ assetId: AssetId; amountMinor: number; occurredAt: Date }>>> {
    if (assetIds.length === 0) return [];
    return this.db
      .select({
        assetId: assetFundings.assetId,
        amountMinor: assetFundings.amountMinor,
        occurredAt: assetFundings.occurredAt
      })
      .from(assetFundings)
      .innerJoin(transactions, eq(transactions.id, assetFundings.transactionId))
      .where(
        and(
          eq(assetFundings.userId, userId),
          eq(transactions.userId, userId),
          inArray(assetFundings.assetId, [...assetIds]),
          isActiveAssetFunding()
        )
      );
  }

  async findActiveSummariesByTransactionIds(
    userId: string,
    transactionIds: readonly TransactionId[]
  ): Promise<
    ReadonlyMap<
      string,
      Readonly<{
        fundingId: string;
        assetId: string;
        assetName: string;
        assetKind: "investment" | "fixed_deposit";
        amountMinor: number;
      }>
    >
  > {
    if (transactionIds.length === 0) return new Map();
    const rows = await this.db
      .select({
        transactionId: assetFundings.transactionId,
        fundingId: assetFundings.id,
        assetId: assets.id,
        assetName: assets.name,
        assetKind: assets.kind,
        amountMinor: assetFundings.amountMinor
      })
      .from(assetFundings)
      .innerJoin(transactions, eq(transactions.id, assetFundings.transactionId))
      .innerJoin(assets, eq(assets.id, assetFundings.assetId))
      .where(
        and(
          eq(assetFundings.userId, userId),
          eq(transactions.userId, userId),
          eq(assets.userId, userId),
          inArray(assetFundings.transactionId, [...transactionIds]),
          isActiveAssetFunding()
        )
      );
    const result = new Map<
      string,
      Readonly<{
        fundingId: string;
        assetId: string;
        assetName: string;
        assetKind: "investment" | "fixed_deposit";
        amountMinor: number;
      }>
    >();
    for (const row of rows) {
      if (row.assetKind !== "investment" && row.assetKind !== "fixed_deposit") continue;
      result.set(row.transactionId, {
        fundingId: row.fundingId,
        assetId: row.assetId,
        assetName: row.assetName,
        assetKind: row.assetKind,
        amountMinor: row.amountMinor
      });
    }
    return result;
  }
}

function toAssetFunding(row: typeof assetFundings.$inferSelect): AssetFunding {
  return AssetFundingSchema.parse(stripNulls(row));
}

function decodeCursor(cursor: string): { occurredAt: Date; id: string } {
  const parsed = decodeCursorPayload(cursor, CursorPayloadSchema);
  return { occurredAt: new Date(parsed.occurredAt), id: parsed.id };
}

function encodeCursor(funding: AssetFunding): string {
  return encodeCursorPayload({ occurredAt: funding.occurredAt.toISOString(), id: funding.id });
}
