import { Inject, Injectable } from "@nestjs/common";
import {
  MarketQuoteSchema,
  type AssetId,
  type AssetMarketLinkId,
  type MarketDataProvider,
  type MarketQuote,
  type MarketQuoteUnit
} from "@treasury-ops/shared";
import { and, desc, eq, isNull } from "drizzle-orm";

import { DATABASE_CONNECTION, type DrizzleDb } from "../common/db/db.module.js";
import type { DbTx } from "../common/db/db-txn.js";
import { assetMarketLinks, assets, marketQuoteSnapshots } from "../common/db/schema/index.js";

export type MarketQuoteRefreshTarget = Readonly<{
  userId: string;
  assetId: AssetId;
  assetMarketLinkId: AssetMarketLinkId;
  provider: MarketDataProvider;
  providerInstrumentId: string;
  quoteUnit: MarketQuoteUnit;
}>;

export type CreateMarketQuote = Readonly<{
  assetMarketLinkId: AssetMarketLinkId;
  provider: MarketDataProvider;
  providerInstrumentId: string;
  quoteUnit: MarketQuoteUnit;
  priceMicroRupeesPerQuoteUnit: number;
  providerAsOf: Date;
  fetchedAt: Date;
}>;

@Injectable()
export class MarketQuoteRepository {
  constructor(@Inject(DATABASE_CONNECTION) private readonly db: DrizzleDb) {}

  /**
   * Worker-only discovery across tenants. It returns the owning user id and
   * never mutates portfolio or ledger data; the caller must pass that id back
   * into every subsequent tenant-scoped operation.
   */
  async systemListAutoRefreshTargets(): Promise<MarketQuoteRefreshTarget[]> {
    const rows = await this.db
      .select({
        userId: assetMarketLinks.userId,
        assetId: assetMarketLinks.assetId,
        assetMarketLinkId: assetMarketLinks.id,
        provider: assetMarketLinks.provider,
        providerInstrumentId: assetMarketLinks.providerInstrumentId,
        quoteUnit: assetMarketLinks.quoteUnit
      })
      .from(assetMarketLinks)
      .innerJoin(assets, eq(assets.id, assetMarketLinks.assetId))
      .where(
        and(
          isNull(assetMarketLinks.supersededAt),
          eq(assetMarketLinks.autoValuationEnabled, true),
          eq(assets.isClosed, false)
        )
      );
    return rows.map((row) => ({
      userId: row.userId,
      assetId: row.assetId,
      assetMarketLinkId: row.assetMarketLinkId,
      provider: row.provider,
      providerInstrumentId: row.providerInstrumentId,
      quoteUnit: row.quoteUnit
    }));
  }

  async createIfAbsent(
    userId: string,
    input: CreateMarketQuote,
    tx: DbTx
  ): Promise<Readonly<{ quote: MarketQuote; inserted: boolean }>> {
    const [created] = await tx
      .insert(marketQuoteSnapshots)
      .values({
        userId,
        assetMarketLinkId: input.assetMarketLinkId,
        provider: input.provider,
        providerInstrumentId: input.providerInstrumentId,
        quoteUnit: input.quoteUnit,
        priceMicroRupeesPerQuoteUnit: input.priceMicroRupeesPerQuoteUnit,
        providerAsOf: input.providerAsOf,
        fetchedAt: input.fetchedAt,
        createdAt: new Date()
      })
      .onConflictDoNothing()
      .returning();
    if (created !== undefined) return { quote: MarketQuoteSchema.parse(created), inserted: true };

    const [existing] = await tx
      .select()
      .from(marketQuoteSnapshots)
      .where(
        and(
          eq(marketQuoteSnapshots.userId, userId),
          eq(marketQuoteSnapshots.assetMarketLinkId, input.assetMarketLinkId),
          eq(marketQuoteSnapshots.provider, input.provider),
          eq(marketQuoteSnapshots.providerAsOf, input.providerAsOf)
        )
      );
    if (existing === undefined) throw new Error("Market quote conflict did not return a row.");
    return { quote: MarketQuoteSchema.parse(existing), inserted: false };
  }

  async findLatestByLink(
    userId: string,
    assetMarketLinkId: AssetMarketLinkId
  ): Promise<MarketQuote | null> {
    const [row] = await this.db
      .select()
      .from(marketQuoteSnapshots)
      .where(
        and(
          eq(marketQuoteSnapshots.userId, userId),
          eq(marketQuoteSnapshots.assetMarketLinkId, assetMarketLinkId)
        )
      )
      .orderBy(desc(marketQuoteSnapshots.providerAsOf), desc(marketQuoteSnapshots.id))
      .limit(1);
    return row === undefined ? null : MarketQuoteSchema.parse(row);
  }
}
