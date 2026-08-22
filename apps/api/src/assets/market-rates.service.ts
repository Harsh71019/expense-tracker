import { Injectable, Logger } from "@nestjs/common";
import { type MarketRates, MarketRatesSchema } from "@treasury-ops/shared";
import { z } from "zod";

interface CachedRates {
  data: MarketRates;
  cachedAtMs: number;
}

const CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes
const GRAMS_PER_TROY_OUNCE = 31.1034768;

// Fallback estimates if external endpoints are completely unreachable
const FALLBACK_RATES: MarketRates = {
  asOf: new Date(),
  usdInr: 95.7,
  gold: {
    priceUsdPerOz: 4680.0,
    priceMinorPerGram: 1440000,
    priceFormatted: "₹14,400.00 / g",
    changePercent24h: 0.0
  },
  silver: {
    priceUsdPerOz: 52.0,
    priceMinorPerGram: 16000,
    priceFormatted: "₹160.00 / g",
    changePercent24h: 0.0
  }
};

@Injectable()
export class MarketRatesService {
  private readonly logger = new Logger(MarketRatesService.name);
  private cache: CachedRates | null = null;

  async getRates(): Promise<MarketRates> {
    const now = Date.now();
    if (this.cache !== null && now - this.cache.cachedAtMs < CACHE_TTL_MS) {
      return this.cache.data;
    }

    try {
      const fresh = await this.fetchLiveRates();
      this.cache = { data: fresh, cachedAtMs: now };
      return fresh;
    } catch (err: unknown) {
      this.logger.warn(`Failed to fetch live market rates, using fallback. Reason: ${String(err)}`);
      if (this.cache !== null) {
        return this.cache.data;
      }
      return FALLBACK_RATES;
    }
  }

  private async fetchYahooPrice(
    symbol: string
  ): Promise<{ price: number; changePercent?: number }> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    try {
      const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1d`;
      const res = await fetch(url, {
        signal: controller.signal,
        headers: { "User-Agent": "Mozilla/5.0" }
      });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status} for ${symbol}`);
      }
      const raw: unknown = await res.json();
      const YahooChartResponseSchema = z.object({
        chart: z
          .object({
            result: z
              .array(
                z.object({
                  meta: z
                    .object({
                      regularMarketPrice: z.number().positive(),
                      chartPreviousClose: z.number().optional()
                    })
                    .passthrough()
                })
              )
              .min(1)
          })
          .optional()
      });
      const parsed = YahooChartResponseSchema.safeParse(raw);
      if (!parsed.success || parsed.data.chart === undefined) {
        throw new Error(`Invalid price for ${symbol}`);
      }
      const meta = parsed.data.chart.result[0]?.meta;
      if (meta === undefined) {
        throw new Error(`Invalid price for ${symbol}`);
      }
      const price = meta.regularMarketPrice;
      const prevClose = meta.chartPreviousClose;
      let changePercent: number | undefined;
      if (typeof prevClose === "number" && prevClose > 0) {
        changePercent = Number((((price - prevClose) / prevClose) * 100).toFixed(2));
      }
      return {
        price,
        ...(changePercent === undefined ? {} : { changePercent })
      };
    } finally {
      clearTimeout(timeout);
    }
  }

  private async fetchLiveRates(): Promise<MarketRates> {
    const [goldRes, silverRes, usdInrRes] = await Promise.all([
      this.fetchYahooPrice("GC=F"),
      this.fetchYahooPrice("SI=F"),
      this.fetchYahooPrice("USDINR=X")
    ]);

    const usdInr = usdInrRes.price;

    const goldPriceInrPerGram = (goldRes.price * usdInr) / GRAMS_PER_TROY_OUNCE;
    const goldPriceMinorPerGram = Math.round(goldPriceInrPerGram * 100);

    const silverPriceInrPerGram = (silverRes.price * usdInr) / GRAMS_PER_TROY_OUNCE;
    const silverPriceMinorPerGram = Math.round(silverPriceInrPerGram * 100);

    const currencyFormatter = new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });

    const rates: MarketRates = {
      asOf: new Date(),
      usdInr,
      gold: {
        priceUsdPerOz: goldRes.price,
        priceMinorPerGram: goldPriceMinorPerGram,
        priceFormatted: `${currencyFormatter.format(goldPriceInrPerGram)} / g`,
        ...(goldRes.changePercent === undefined ? {} : { changePercent24h: goldRes.changePercent })
      },
      silver: {
        priceUsdPerOz: silverRes.price,
        priceMinorPerGram: silverPriceMinorPerGram,
        priceFormatted: `${currencyFormatter.format(silverPriceInrPerGram)} / g`,
        ...(silverRes.changePercent === undefined
          ? {}
          : { changePercent24h: silverRes.changePercent })
      }
    };

    return MarketRatesSchema.parse(rates);
  }
}
