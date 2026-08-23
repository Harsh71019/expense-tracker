import { describe, expect, it, vi } from "vitest";

import { createMockConfig } from "../../test/mock-config.js";
import { MarketRatesRefreshService } from "../market-rates-refresh.service.js";

describe("MarketRatesRefreshService", () => {
  it("does not call the provider from the API process", async () => {
    const marketRates = { refreshRates: vi.fn() };
    const service = new MarketRatesRefreshService(createMockConfig("api"), marketRates);

    await service.refresh();

    expect(marketRates.refreshRates).not.toHaveBeenCalled();
  });

  it("refreshes both indicative quotes in the worker process", async () => {
    const marketRates = { refreshRates: vi.fn(async () => undefined) };
    const service = new MarketRatesRefreshService(createMockConfig("worker"), marketRates);

    await service.refresh();

    expect(marketRates.refreshRates).toHaveBeenCalledOnce();
  });
});
