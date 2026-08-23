import { Inject, Injectable } from "@nestjs/common";
import {
  AssetMarketLinkSchema,
  AssetPositionEventIdSchema,
  AssetPositionEventSchema,
  type AssetId,
  type AssetMarketLink,
  type AssetMarketLinkId,
  type AssetPositionEvent,
  type AssetPositionEventId,
  type AssetFundingId,
  type AssetPositionEventPage,
  type CreateAssetMarketLink,
  type CreateAssetPositionEvent,
  type ListAssetPositionEventsQuery
} from "@treasury-ops/shared";
import { and, asc, desc, eq, isNull, lt, or } from "drizzle-orm";
import { z } from "zod";

import { DATABASE_CONNECTION, type DrizzleDb } from "../common/db/db.module.js";
import type { DbTx } from "../common/db/db-txn.js";
import { assetMarketLinks, assetPositionEvents } from "../common/db/schema/index.js";
import { stripNulls } from "../common/db/strip-nulls.js";
import { decodeCursorPayload, encodeCursorPayload } from "../common/pagination/cursor.js";

const PositionEventCursorSchema = z.object({
  occurredAt: z.string().datetime(),
  id: AssetPositionEventIdSchema
});

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

  async findActiveLinkByAssetIdForUpdate(
    userId: string,
    assetId: AssetId,
    tx: DbTx
  ): Promise<AssetMarketLink | null> {
    const [row] = await tx
      .select()
      .from(assetMarketLinks)
      .where(
        and(
          eq(assetMarketLinks.userId, userId),
          eq(assetMarketLinks.assetId, assetId),
          isNull(assetMarketLinks.supersededAt)
        )
      )
      .for("update");
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

  async supersedeActiveLink(
    userId: string,
    linkId: AssetMarketLinkId,
    supersededAt: Date,
    tx: DbTx
  ): Promise<boolean> {
    const rows = await tx
      .update(assetMarketLinks)
      .set({ supersededAt })
      .where(
        and(
          eq(assetMarketLinks.userId, userId),
          eq(assetMarketLinks.id, linkId),
          isNull(assetMarketLinks.supersededAt)
        )
      )
      .returning({ id: assetMarketLinks.id });
    return rows.length === 1;
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

  async findPositionEventByFundingIdForUpdate(
    userId: string,
    fundingId: AssetFundingId,
    tx: DbTx
  ): Promise<AssetPositionEvent | null> {
    const [row] = await tx
      .select()
      .from(assetPositionEvents)
      .where(
        and(
          eq(assetPositionEvents.userId, userId),
          eq(assetPositionEvents.assetFundingId, fundingId)
        )
      )
      .for("update");
    return row === undefined ? null : AssetPositionEventSchema.parse(stripNulls(row));
  }

  async findReversalForPositionEvent(
    userId: string,
    eventId: AssetPositionEventId,
    tx: DbTx
  ): Promise<AssetPositionEvent | null> {
    const [row] = await tx
      .select()
      .from(assetPositionEvents)
      .where(
        and(eq(assetPositionEvents.userId, userId), eq(assetPositionEvents.reversalOf, eventId))
      );
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

  async listAllPositionEventsByAsset(
    userId: string,
    assetId: AssetId,
    tx?: DbTx
  ): Promise<AssetPositionEvent[]> {
    const executor = tx ?? this.db;
    const rows = await executor
      .select()
      .from(assetPositionEvents)
      .where(and(eq(assetPositionEvents.userId, userId), eq(assetPositionEvents.assetId, assetId)))
      .orderBy(asc(assetPositionEvents.occurredAt), asc(assetPositionEvents.id));
    return rows.map((row) => AssetPositionEventSchema.parse(stripNulls(row)));
  }

  async findPositionEventPageByAsset(
    userId: string,
    assetId: AssetId,
    query: ListAssetPositionEventsQuery
  ): Promise<AssetPositionEventPage> {
    const cursor = query.cursor === undefined ? null : decodePositionEventCursor(query.cursor);
    const rows = await this.db
      .select()
      .from(assetPositionEvents)
      .where(
        and(
          eq(assetPositionEvents.userId, userId),
          eq(assetPositionEvents.assetId, assetId),
          ...(cursor === null
            ? []
            : [
                or(
                  lt(assetPositionEvents.occurredAt, cursor.occurredAt),
                  and(
                    eq(assetPositionEvents.occurredAt, cursor.occurredAt),
                    lt(assetPositionEvents.id, cursor.id)
                  )
                )
              ])
        )
      )
      .orderBy(desc(assetPositionEvents.occurredAt), desc(assetPositionEvents.id))
      .limit(query.limit + 1);
    const items = rows
      .slice(0, query.limit)
      .map((row) => AssetPositionEventSchema.parse(stripNulls(row)));
    const last = items.at(-1);
    return {
      items,
      pageInfo: {
        nextCursor:
          rows.length > query.limit && last !== undefined ? encodePositionEventCursor(last) : null,
        hasMore: rows.length > query.limit,
        limit: query.limit
      }
    };
  }
}

function decodePositionEventCursor(
  cursor: string
): Readonly<{ occurredAt: Date; id: AssetPositionEventId }> {
  const payload = decodeCursorPayload(cursor, PositionEventCursorSchema);
  return { occurredAt: new Date(payload.occurredAt), id: payload.id };
}

function encodePositionEventCursor(event: AssetPositionEvent): string {
  return encodeCursorPayload({ occurredAt: event.occurredAt.toISOString(), id: event.id });
}
