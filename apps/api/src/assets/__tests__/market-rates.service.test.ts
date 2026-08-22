import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MarketRatesService } from "../market-rates.service.js";

describe("MarketRatesService", () => {
  let service: MarketRatesService;
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    service = new MarketRatesService();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("fetches and parses live metal rates correctly", async () => {
    globalThis.fetch = vi.fn().mockImplementation((url: string | URL | Request) => {
      const urlStr = url.toString();
      if (urlStr.includes("GC%3DF") || urlStr.includes("GC=F")) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              chart: {
                result: [
                  {
                    meta: {
                      regularMarketPrice: 4680.0,
                      chartPreviousClose: 4600.0
                    }
                  }
                ]
              }
            })
        });
      }
      if (urlStr.includes("SI%3DF") || urlStr.includes("SI=F")) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              chart: {
                result: [
                  {
                    meta: {
                      regularMarketPrice: 52.0,
                      chartPreviousClose: 51.0
                    }
                  }
                ]
              }
            })
        });
      }
      if (urlStr.includes("USDINR%3DX") || urlStr.includes("USDINR=X")) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              chart: {
                result: [
                  {
                    meta: {
                      regularMarketPrice: 95.0,
                      chartPreviousClose: 94.8
                    }
                  }
                ]
              }
            })
        });
      }
      return Promise.reject(new Error("Unexpected url"));
    });

    const rates = await service.getRates();

    expect(rates.usdInr).toBe(95.0);
    expect(rates.gold.priceUsdPerOz).toBe(4680.0);
    // (4680 * 95) / 31.1034768 = ~14294.22 => 1429422 paise
    expect(rates.gold.priceMinorPerGram).toBeGreaterThan(1400000);
    expect(rates.silver.priceUsdPerOz).toBe(52.0);
    expect(rates.silver.priceMinorPerGram).toBeGreaterThan(15000);
  });

  it("returns fallback rates when fetch fails", async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error("Network error"));

    const rates = await service.getRates();

    expect(rates.usdInr).toBe(95.7);
    expect(rates.gold.priceUsdPerOz).toBe(4680.0);
    expect(rates.silver.priceUsdPerOz).toBe(52.0);
  });

  it("serves from cache within TTL", async () => {
    let callCount = 0;
    globalThis.fetch = vi.fn().mockImplementation(() => {
      callCount += 1;
      return Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            chart: {
              result: [{ meta: { regularMarketPrice: 100 } }]
            }
          })
      });
    });

    await service.getRates();
    const callsAfterFirst = callCount;
    expect(callsAfterFirst).toBe(3); // 3 symbols

    await service.getRates();
    expect(callCount).toBe(callsAfterFirst); // served from cache
  });
});
