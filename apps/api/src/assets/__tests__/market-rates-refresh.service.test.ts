import type { MarketRates } from "@treasury-ops/shared";
import { describe, expect, it, vi } from "vitest";

import { createMockConfig } from "../../test/mock-config.js";
import { MarketRatesRefreshService } from "../market-rates-refresh.service.js";

const MARKET_RATES: MarketRates = {
  asOf: new Date("2026-08-23T12:30:00.000Z"),
  source: "gold_api",
  isStale: false,
  gold: {
    priceMicroRupeesPerGram: 100_000_000,
    priceMinorPerGram: 10_000,
    priceFormatted: "₹100.00 / g",
    providerAsOf: new Date("2026-08-23T12:30:00.000Z")
  },
  silver: {
    priceMicroRupeesPerGram: 100_000_000,
    priceMinorPerGram: 10_000,
    priceFormatted: "₹100.00 / g",
    providerAsOf: new Date("2026-08-23T12:30:00.000Z")
  }
};

describe("MarketRatesRefreshService", () => {
  it("does not call the provider from the API process", async () => {
    const marketRates = { refreshRates: vi.fn() };
    const service = new MarketRatesRefreshService(createMockConfig("api"), marketRates);

    await service.refresh();

    expect(marketRates.refreshRates).not.toHaveBeenCalled();
  });

  it("refreshes both indicative quotes in the worker process", async () => {
    const marketRates = { refreshRates: vi.fn(async () => MARKET_RATES) };
    const service = new MarketRatesRefreshService(createMockConfig("worker"), marketRates);

    await service.refresh();

    expect(marketRates.refreshRates).toHaveBeenCalledOnce();
  });
});
