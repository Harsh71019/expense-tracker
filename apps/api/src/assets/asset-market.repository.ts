import { Inject, Injectable } from "@nestjs/common";
import {
  AssetMarketLinkSchema,
  AssetPositionEventSchema,
  type AssetId,
  type AssetMarketLink,
  type AssetMarketLinkId,
  type AssetPositionEvent,
  type AssetPositionEventId,
  type CreateAssetMarketLink,
  type CreateAssetPositionEvent
} from "@treasury-ops/shared";
import { and, desc, eq, isNull } from "drizzle-orm";

import { DATABASE_CONNECTION, type DrizzleDb } from "../common/db/db.module.js";
import type { DbTx } from "../common/db/db-txn.js";
import { assetMarketLinks, assetPositionEvents } from "../common/db/schema/index.js";
import { stripNulls } from "../common/db/strip-nulls.js";

@Injectable()
export class AssetMarketRepository {
  constructor(@Inject(DATABASE_CONNECTION) private readonly db: DrizzleDb) {}

  async createLink(
    userId: string,
    input: CreateAssetMarketLink,
    tx: DbTx
  ): Promise<AssetMarketLink> {
    const [row] = await tx
      .insert(assetMarketLinks)
      .values({
        userId,
        assetId: input.assetId,
        instrumentType: input.instrumentType,
        provider: input.provider,
        providerInstrumentId: input.providerInstrumentId,
        isin: input.isin ?? null,
        schemeCode: input.schemeCode ?? null,
        schemePlan: input.schemePlan ?? null,
        schemeOption: input.schemeOption ?? null,
        acquisitionChannel: input.acquisitionChannel ?? null,
        quoteUnit: input.quoteUnit,
        purityBps: input.purityBps ?? null,
        autoValuationEnabled: input.autoValuationEnabled,
        effectiveFrom: input.effectiveFrom,
        revisionOf: input.revisionOf ?? null,
        createdAt: new Date()
      })
      .returning();
    if (row === undefined) throw new Error("Asset market-link insert did not return a row.");
    return AssetMarketLinkSchema.parse(stripNulls(row));
  }

  async findActiveLinkByAssetId(
    userId: string,
    assetId: AssetId,
    tx?: DbTx
  ): Promise<AssetMarketLink | null> {
    const executor = tx ?? this.db;
    const [row] = await executor
      .select()
      .from(assetMarketLinks)
      .where(
        and(
          eq(assetMarketLinks.userId, userId),
          eq(assetMarketLinks.assetId, assetId),
          isNull(assetMarketLinks.supersededAt)
        )
      );
    return row === undefined ? null : AssetMarketLinkSchema.parse(stripNulls(row));
  }

  async findLinkByIdForUpdate(
    userId: string,
    linkId: AssetMarketLinkId,
    tx: DbTx
  ): Promise<AssetMarketLink | null> {
    const [row] = await tx
      .select()
      .from(assetMarketLinks)
      .where(and(eq(assetMarketLinks.userId, userId), eq(assetMarketLinks.id, linkId)))
      .for("update");
    return row === undefined ? null : AssetMarketLinkSchema.parse(stripNulls(row));
  }

  async listLinkRevisions(userId: string, assetId: AssetId): Promise<AssetMarketLink[]> {
    const rows = await this.db
      .select()
      .from(assetMarketLinks)
      .where(and(eq(assetMarketLinks.userId, userId), eq(assetMarketLinks.assetId, assetId)))
      .orderBy(desc(assetMarketLinks.effectiveFrom), desc(assetMarketLinks.id));
    return rows.map((row) => AssetMarketLinkSchema.parse(stripNulls(row)));
  }

  async createPositionEvent(
    userId: string,
    input: CreateAssetPositionEvent,
    tx: DbTx
  ): Promise<AssetPositionEvent> {
    const [row] = await tx
      .insert(assetPositionEvents)
      .values({
        userId,
        assetId: input.assetId,
        eventType: input.eventType,
        quantityMicroUnits: input.quantityMicroUnits,
        grossAmountMinor: input.grossAmountMinor ?? null,
        chargesMinor: input.chargesMinor ?? null,
        taxesAtAcquisitionMinor: input.taxesAtAcquisitionMinor ?? null,
        occurredAt: input.occurredAt,
        transactionId: input.transactionId ?? null,
        assetFundingId: input.assetFundingId ?? null,
        source: input.source,
        sourceReference: input.sourceReference,
        portfolioImportRowId: input.portfolioImportRowId ?? null,
        reversalOf: input.reversalOf ?? null,
        createdAt: new Date()
      })
      .returning();
    if (row === undefined) throw new Error("Asset position-event insert did not return a row.");
    return AssetPositionEventSchema.parse(stripNulls(row));
  }

  async findPositionEventByIdForUpdate(
    userId: string,
    eventId: AssetPositionEventId,
    tx: DbTx
  ): Promise<AssetPositionEvent | null> {
    const [row] = await tx
      .select()
      .from(assetPositionEvents)
      .where(and(eq(assetPositionEvents.userId, userId), eq(assetPositionEvents.id, eventId)))
      .for("update");
    return row === undefined ? null : AssetPositionEventSchema.parse(stripNulls(row));
  }

  async listPositionEventsByAsset(
    userId: string,
    assetId: AssetId,
    limit: number
  ): Promise<AssetPositionEvent[]> {
    const rows = await this.db
      .select()
      .from(assetPositionEvents)
      .where(and(eq(assetPositionEvents.userId, userId), eq(assetPositionEvents.assetId, assetId)))
      .orderBy(desc(assetPositionEvents.occurredAt), desc(assetPositionEvents.id))
      .limit(limit);
    return rows.map((row) => AssetPositionEventSchema.parse(stripNulls(row)));
  }
}
