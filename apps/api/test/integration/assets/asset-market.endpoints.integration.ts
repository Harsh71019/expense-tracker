import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { AmfiNavService } from "../../../src/assets/amfi-nav.service.js";
import { AssetMarketRepository } from "../../../src/assets/asset-market.repository.js";
import { AssetMarketValuationService } from "../../../src/assets/asset-market-valuation.service.js";
import { AssetPositionService } from "../../../src/assets/asset-position.service.js";
import { AssetRepository } from "../../../src/assets/asset.repository.js";
import { DisposalEstimateService } from "../../../src/assets/disposal-estimate.service.js";
import { InstrumentDiscoveryService } from "../../../src/assets/instrument-discovery.service.js";
import { MarketQuoteRepository } from "../../../src/assets/market-quote.repository.js";
import { MarketValuationRefreshService } from "../../../src/assets/market-valuation-refresh.service.js";
import { ValuationRepository } from "../../../src/assets/valuation.repository.js";
import { AuditRepository } from "../../../src/audit/audit.repository.js";
import { withTxn } from "../../../src/common/db/db-txn.js";
import { focusedTestDouble } from "../../../src/test/mock-drizzle.js";
import { assertLedgerInvariants } from "../support/assert-ledger-invariants.js";
import { createTestDb, insertTestUser } from "../support/postgres-test-db.js";
import type { TestDb } from "../support/postgres-test-db.js";

const USER_ID = "asset-market-endpoints-user";

describe("Asset Market Endpoints Integration", () => {
  let testDb: TestDb;
  let assetRepo: AssetRepository;
  let marketRepo: AssetMarketRepository;
  let quoteRepo: MarketQuoteRepository;
  let valuationRepo: ValuationRepository;
  let discoveryService: InstrumentDiscoveryService;
  let valuationService: AssetMarketValuationService;
  let disposalService: DisposalEstimateService;

  beforeAll(async () => {
    testDb = await createTestDb();
    await insertTestUser(testDb.db, USER_ID);

    assetRepo = new AssetRepository(testDb.db);
    marketRepo = new AssetMarketRepository(testDb.db);
    quoteRepo = new MarketQuoteRepository(testDb.db);
    valuationRepo = new ValuationRepository(testDb.db);
    const auditRepo = new AuditRepository(testDb.db);
    const positions = new AssetPositionService(assetRepo, marketRepo, auditRepo);
    const mockAmfiNav = focusedTestDouble<AmfiNavService>({
      getCatalog: async () => [
        {
          instrumentType: "mutual_fund",
          provider: "amfi",
          providerInstrumentId: "120716",
          schemeCode: "120716",
          isin: "INF209K01157",
          name: "Aditya Birla Sun Life Frontline Equity Fund - Growth - Regular Plan",
          quoteUnit: "fund_unit"
        }
      ],
      fetchTrackedQuotes: async () => new Map()
    });

    discoveryService = new InstrumentDiscoveryService(mockAmfiNav);

    const mockRefresh = focusedTestDouble<MarketValuationRefreshService>({
      refreshTrackedAmfiAssets: async () => Promise.resolve(0)
    });

    valuationService = new AssetMarketValuationService(
      assetRepo,
      marketRepo,
      quoteRepo,
      positions,
      valuationRepo,
      mockRefresh
    );

    disposalService = new DisposalEstimateService(assetRepo, marketRepo, quoteRepo, positions);
  });

  afterEach(async () => {
    await assertLedgerInvariants(testDb.db);
  });

  afterAll(async () => {
    await testDb.teardown();
  });

  it("searches instruments catalog across types", async () => {
    const mfResults = await discoveryService.searchInstruments({
      limit: 50,
      type: "mutual_fund",
      q: "Frontline"
    });
    expect(mfResults.items.length).toBeGreaterThanOrEqual(1);
    expect(mfResults.items[0]?.providerInstrumentId).toBe("120716");

    const goldResults = await discoveryService.searchInstruments({
      limit: 50,
      type: "physical_gold"
    });
    expect(goldResults.items.length).toBeGreaterThanOrEqual(1);
    expect(goldResults.items.some((i) => i.name.includes("24 Karat"))).toBe(true);
  });

  it("provides valuation details and calculates FIFO disposal estimates", async () => {
    const asset = await withTxn(testDb.db, (tx) =>
      assetRepo.create(
        USER_ID,
        {
          kind: "investment",
          name: "Test Valuation Fund",
          openedAt: new Date("2024-01-01"),
          openingValueMinor: 0
        },
        tx
      )
    );

    const link = await withTxn(testDb.db, (tx) =>
      marketRepo.createLink(
        USER_ID,
        {
          assetId: asset.id,
          instrumentType: "mutual_fund",
          provider: "amfi",
          providerInstrumentId: "120716",
          quoteUnit: "fund_unit",
          autoValuationEnabled: true,
          effectiveFrom: new Date("2024-01-01")
        },
        tx
      )
    );

    await withTxn(testDb.db, (tx) =>
      marketRepo.createPositionEvent(
        USER_ID,
        {
          assetId: asset.id,
          eventType: "purchase",
          quantityMicroUnits: 200_000_000, // 200 units
          grossAmountMinor: 2000000, // ₹20,000 cost (NAV ₹100)
          occurredAt: new Date("2024-06-01"),
          source: "manual",
          sourceReference: "ref_init"
        },
        tx
      )
    );

    const now = new Date();
    await withTxn(testDb.db, (tx) =>
      quoteRepo.createIfAbsent(
        USER_ID,
        {
          assetMarketLinkId: link.id,
          provider: "amfi",
          providerInstrumentId: "120716",
          quoteUnit: "fund_unit",
          priceMicroRupeesPerQuoteUnit: 150_000_000, // NAV ₹150
          providerAsOf: now,
          fetchedAt: now
        },
        tx
      )
    );

    // 1. Valuation details
    const details = await valuationService.getValuationDetails(USER_ID, asset.id);
    expect(details.assetId).toBe(asset.id);
    expect(details.position.quantityMicroUnits).toBe(200_000_000);
    // 200 units * ₹150 = ₹30,000 = 3,000,000 paise
    expect(details.estimatedValueMinor).toBe(3000000);
    expect(details.quote?.freshness).toBe("fresh");

    // 2. Disposal estimate (selling 100 units)
    const disposal = await disposalService.estimateDisposal(USER_ID, asset.id, {
      quantityMicroUnits: 100_000_000,
      disposalDate: new Date("2026-08-23"),
      expectedOtherChargesMinor: 0
    });

    expect(disposal.grossProceedsMinor).toBe(1500000); // 100 * ₹150 = ₹15,000
    expect(disposal.costBasisMinor).toBe(1000000); // 100 * ₹100 = ₹10,000
    expect(disposal.estimatedGainMinor).toBe(500000); // ₹5,000 gain
    expect(disposal.lots[0]?.term).toBe("long_term");
    // Section 112A exemption covers ₹5,000 LTCG -> ₹0 tax
    expect(disposal.estimatedTaxMinor).toBe(0);
    expect(disposal.postTaxProceedsMinor).toBe(1500000);
  });
});
