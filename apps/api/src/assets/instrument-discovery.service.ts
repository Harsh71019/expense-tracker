import { Injectable } from "@nestjs/common";
import {
  type ListMarketInstrumentsQuery,
  type MarketInstrumentItem,
  type MarketInstrumentPage
} from "@treasury-ops/shared";
import { z } from "zod";

import { decodeCursorPayload, encodeCursorPayload } from "../common/pagination/cursor.js";
import { AmfiNavService } from "./amfi-nav.service.js";

const CursorSchema = z.object({ offset: z.number().int().nonnegative() });

const PRESET_METALS: readonly MarketInstrumentItem[] = [
  {
    instrumentType: "physical_gold",
    provider: "goldapi",
    providerInstrumentId: "XAU_INR_24K",
    name: "24 Karat 999 Fine Gold",
    quoteUnit: "gram"
  },
  {
    instrumentType: "physical_gold",
    provider: "goldapi",
    providerInstrumentId: "XAU_INR_22K",
    name: "22 Karat 916 Standard Gold",
    quoteUnit: "gram"
  },
  {
    instrumentType: "physical_gold",
    provider: "goldapi",
    providerInstrumentId: "XAU_INR_18K",
    name: "18 Karat 750 Gold",
    quoteUnit: "gram"
  },
  {
    instrumentType: "physical_silver",
    provider: "goldapi",
    providerInstrumentId: "XAG_INR_999",
    name: "999 Fine Silver",
    quoteUnit: "gram"
  },
  {
    instrumentType: "physical_silver",
    provider: "goldapi",
    providerInstrumentId: "XAG_INR_925",
    name: "925 Sterling Silver",
    quoteUnit: "gram"
  }
] as const;

@Injectable()
export class InstrumentDiscoveryService {
  constructor(private readonly amfiNav: AmfiNavService) {}

  async searchInstruments(query: ListMarketInstrumentsQuery): Promise<MarketInstrumentPage> {
    const limit = query.limit ?? 50;
    const offset =
      query.cursor === undefined ? 0 : decodeCursorPayload(query.cursor, CursorSchema).offset;

    const items: MarketInstrumentItem[] = [];

    if (query.type === "mutual_fund" || query.type === undefined) {
      const mfItems = await this.searchMutualFunds(query.q);
      items.push(...mfItems);
    }

    if (
      query.type === "physical_gold" ||
      query.type === "physical_silver" ||
      query.type === undefined
    ) {
      const metalItems = PRESET_METALS.filter((item) => {
        if (query.type !== undefined && item.instrumentType !== query.type) return false;
        if (query.q !== undefined && query.q.trim().length > 0) {
          const search = query.q.toLowerCase().trim();
          return (
            item.name.toLowerCase().includes(search) ||
            item.providerInstrumentId.toLowerCase().includes(search)
          );
        }
        return true;
      });
      items.push(...metalItems);
    }

    const pageItems = items.slice(offset, offset + limit);
    const hasMore = offset + limit < items.length;
    const nextCursor = hasMore ? encodeCursorPayload({ offset: offset + limit }) : null;

    return {
      items: pageItems,
      pageInfo: {
        nextCursor,
        hasMore,
        limit
      }
    };
  }

  private async searchMutualFunds(searchQuery?: string): Promise<MarketInstrumentItem[]> {
    const catalog = await this.amfiNav.getCatalog();
    if (searchQuery === undefined || searchQuery.trim().length === 0) {
      return catalog;
    }

    const tokens = searchQuery
      .toLowerCase()
      .trim()
      .split(/\s+/u)
      .filter((t) => t.length > 0);

    return catalog.filter((item) => {
      const name = item.name.toLowerCase();
      const code = item.schemeCode?.toLowerCase() ?? "";
      const isin = item.isin?.toLowerCase() ?? "";

      return tokens.every(
        (token) => name.includes(token) || code.includes(token) || isin.includes(token)
      );
    });
  }
}
