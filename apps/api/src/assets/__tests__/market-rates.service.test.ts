import { afterEach, describe, expect, it, vi } from "vitest";

import { MarketRatesService } from "../market-rates.service.js";

const CACHE_KEY = "treasury-ops:market-rates:gold-api:v1";

function createCache(initialValue: string | null = null) {
  let value = initialValue;
  return {
    get: vi.fn(async () => value),
    set: vi.fn(async (_key: string, next: string) => {
      value = next;
    }),
    delete: vi.fn(async () => {
      value = null;
    })
  };
}

function response(symbol: "XAU" | "XAG", price: string, updatedAt: string): Response {
  return new Response(JSON.stringify({ currency: "INR", symbol, price, updatedAt }), {
    status: 200,
    headers: { "content-type": "application/json" }
  });
}

describe("MarketRatesService", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("hydrates the shared cache from Gold API INR quotes using fixed-point conversion", async () => {
    const cache = createCache();
    const service = new MarketRatesService(cache);
    globalThis.fetch = vi.fn((input: string | URL | Request) => {
      const url = input.toString();
      if (url.endsWith("/XAU/INR")) {
        return Promise.resolve(response("XAU", "311.034768", "2026-08-23T12:00:00.000Z"));
      }
      if (url.endsWith("/XAG/INR")) {
        return Promise.resolve(response("XAG", "31.1034768", "2026-08-23T12:01:00.000Z"));
      }
      return Promise.reject(new Error("Unexpected Gold API path."));
    });

    const rates = await service.getRates();

    expect(rates).toMatchObject({ source: "gold_api", isStale: false });
    expect(rates.asOf).toEqual(new Date("2026-08-23T12:01:00.000Z"));
    expect(rates.gold).toMatchObject({
      priceMicroRupeesPerGram: 10_000_000,
      priceMinorPerGram: 1_000,
      priceFormatted: "₹10.00 / g"
    });
    expect(rates.silver).toMatchObject({
      priceMicroRupeesPerGram: 1_000_000,
      priceMinorPerGram: 100,
      priceFormatted: "₹1.00 / g"
    });
    expect(cache.set).toHaveBeenCalledWith(CACHE_KEY, expect.any(String), 259_200);
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
  });

  it("serves a stale cached quote without making an outbound request", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-25T16:00:00.000Z"));
    const cache = createCache(
      JSON.stringify({
        asOf: "2026-08-23T12:00:00.000Z",
        source: "gold_api",
        isStale: false,
        gold: {
          priceMicroRupeesPerGram: 10_000_000,
          priceMinorPerGram: 1_000,
          priceFormatted: "₹10.00 / g",
          providerAsOf: "2026-08-23T12:00:00.000Z"
        },
        silver: {
          priceMicroRupeesPerGram: 1_000_000,
          priceMinorPerGram: 100,
          priceFormatted: "₹1.00 / g",
          providerAsOf: "2026-08-23T12:00:00.000Z"
        }
      })
    );
    const service = new MarketRatesService(cache);
    globalThis.fetch = vi.fn();

    await expect(service.getRates()).resolves.toMatchObject({ isStale: true });
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("does not invent fallback prices when Gold API and the cache are unavailable", async () => {
    const service = new MarketRatesService(createCache());
    globalThis.fetch = vi.fn(() => Promise.reject(new Error("Network error")));

    await expect(service.getRates()).rejects.toThrow(
      "Gold API market rates are temporarily unavailable."
    );
  });

  it("discards malformed cached data before hydrating a fresh provider quote", async () => {
    const cache = createCache("not-json");
    const service = new MarketRatesService(cache);
    globalThis.fetch = vi.fn((input: string | URL | Request) => {
      const url = input.toString();
      return Promise.resolve(
        response(url.endsWith("/XAU/INR") ? "XAU" : "XAG", "311.034768", "2026-08-23T12:00:00.000Z")
      );
    });

    await expect(service.getRates()).resolves.toMatchObject({ isStale: false });
    expect(cache.delete).toHaveBeenCalledWith(CACHE_KEY);
  });
});
