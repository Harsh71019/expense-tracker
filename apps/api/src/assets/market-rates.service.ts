import { Inject, Injectable } from "@nestjs/common";
import {
  FixedPointDecimalSchema,
  formatMinor,
  MarketRatesSchema,
  microRupeesToMinorUnits,
  parseTroyOunceInrToMicroRupeesPerGram,
  type MarketRates
} from "@treasury-ops/shared";
import { z } from "zod";

import { DependencyUnavailableError } from "../common/errors/dependency-unavailable.error.js";
import { RedisService } from "../common/redis/redis.service.js";

const GOLD_API_BASE_URL = "https://api.gold-api.com";
const GOLD_API_CACHE_KEY = "treasury-ops:market-rates:gold-api:v1";
const GOLD_API_CACHE_TTL_SECONDS = 3 * 24 * 60 * 60;
const STALE_AFTER_MS = 27 * 60 * 60 * 1_000;
const REQUEST_TIMEOUT_MS = 5_000;

const ProviderDecimalSchema = z
  .union([z.string(), z.number().finite()])
  .transform((value) => (typeof value === "string" ? value : value.toString()))
  .pipe(FixedPointDecimalSchema);

const GoldApiQuoteSchema = z.object({
  currency: z.literal("INR"),
  price: ProviderDecimalSchema,
  symbol: z.enum(["XAU", "XAG"]),
  updatedAt: z.iso.datetime({ offset: true }).transform((value) => new Date(value))
});

const FreshMarketRatesSchema = MarketRatesSchema.extend({ isStale: z.literal(false) });

type GoldApiSymbol = z.infer<typeof GoldApiQuoteSchema>["symbol"];
type GoldApiQuote = z.infer<typeof GoldApiQuoteSchema>;
type FreshMarketRates = z.infer<typeof FreshMarketRatesSchema>;
type MarketRatesCache = Pick<RedisService, "delete" | "get" | "set">;

@Injectable()
export class MarketRatesService {
  constructor(@Inject(RedisService) private readonly redis: MarketRatesCache) {}

  /**
   * Reads the globally cached quote. A first request may hydrate an empty
   * cache, but ordinary HTTP reads never call the provider after that; the
   * worker's daily scheduled refresh owns ongoing outbound requests.
   */
  async getRates(): Promise<MarketRates> {
    const cached = await this.readCachedRates();
    if (cached !== null) return this.withStaleness(cached);

    return this.refreshRates();
  }

  /** Fetches both provider quotes before atomically replacing the shared cache. */
  async refreshRates(): Promise<MarketRates> {
    try {
      const [gold, silver] = await Promise.all([this.fetchQuote("XAU"), this.fetchQuote("XAG")]);
      const fresh = FreshMarketRatesSchema.parse({
        asOf: latestTimestamp(gold.updatedAt, silver.updatedAt),
        source: "gold_api",
        isStale: false,
        gold: toMetalRate(gold),
        silver: toMetalRate(silver)
      });
      await this.redis.set(GOLD_API_CACHE_KEY, JSON.stringify(fresh), GOLD_API_CACHE_TTL_SECONDS);
      return fresh;
    } catch {
      throw new DependencyUnavailableError("Gold API market rates are temporarily unavailable.");
    }
  }

  private async readCachedRates(): Promise<FreshMarketRates | null> {
    const cached = await this.redis.get(GOLD_API_CACHE_KEY);
    if (cached === null) return null;

    try {
      const parsed: unknown = JSON.parse(cached);
      return FreshMarketRatesSchema.parse(parsed);
    } catch {
      await this.redis.delete(GOLD_API_CACHE_KEY);
      return null;
    }
  }

  private async fetchQuote(expectedSymbol: GoldApiSymbol): Promise<GoldApiQuote> {
    const response = await fetch(`${GOLD_API_BASE_URL}/price/${expectedSymbol}/INR`, {
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      headers: { Accept: "application/json" }
    });
    if (!response.ok) {
      throw new Error(`Gold API returned HTTP ${response.status}.`);
    }

    const body: unknown = JSON.parse(await response.text());
    const quote = GoldApiQuoteSchema.parse(body);
    if (quote.symbol !== expectedSymbol) {
      throw new Error("Gold API returned a quote for an unexpected metal.");
    }
    return quote;
  }

  private withStaleness(cached: FreshMarketRates): MarketRates {
    return MarketRatesSchema.parse({
      ...cached,
      isStale: Date.now() - cached.asOf.getTime() > STALE_AFTER_MS
    });
  }
}

function toMetalRate(quote: GoldApiQuote): MarketRates["gold"] {
  const priceMicroRupeesPerGram = parseTroyOunceInrToMicroRupeesPerGram(quote.price);
  const priceMinorPerGram = microRupeesToMinorUnits(priceMicroRupeesPerGram);
  return {
    priceMicroRupeesPerGram,
    priceMinorPerGram,
    priceFormatted: `${formatMinor(priceMinorPerGram)} / g`,
    providerAsOf: quote.updatedAt
  };
}

function latestTimestamp(first: Date, second: Date): Date {
  return first.getTime() >= second.getTime() ? first : second;
}
