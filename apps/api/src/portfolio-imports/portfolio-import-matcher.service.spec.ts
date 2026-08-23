import { describe, expect, it } from "vitest";
import type { Asset, AssetMarketLink } from "@treasury-ops/shared";

import { PortfolioImportMatcherService } from "./portfolio-import-matcher.service.js";
import type { ParsedCasRow } from "./kfintech-cams-cas-parser.js";

describe("PortfolioImportMatcherService", () => {
  const matcher = new PortfolioImportMatcherService();

  const asset1: Asset = {
    id: "00000000-0000-0000-0000-000000000001",
    userId: "user-1",
    kind: "investment",
    name: "Parag Parikh Flexi Cap Fund - Direct Plan",
    openedAt: new Date("2024-01-01"),
    isClosed: false,
    createdAt: new Date("2024-01-01"),
    updatedAt: new Date("2024-01-01")
  };

  const link1: AssetMarketLink = {
    id: "00000000-0000-0000-0000-000000000011",
    userId: "user-1",
    assetId: asset1.id,
    instrumentType: "mutual_fund",
    provider: "amfi",
    providerInstrumentId: "INF879O01019",
    isin: "INF879O01019",
    schemeCode: "122639",
    quoteUnit: "fund_unit",
    autoValuationEnabled: true,
    effectiveFrom: new Date("2024-01-01"),
    createdAt: new Date("2024-01-01")
  };

  it("matches row by exact ISIN", () => {
    const row: ParsedCasRow = {
      rowKind: "holding",
      displayName: "PPFAS Flexi Cap Fund Direct Growth",
      isin: "INF879O01019",
      folioReferenceMasked: "****1234",
      quantityMicroUnits: 100_000_000,
      proposedAction: "reconcile"
    };

    const result = matcher.matchRows([row], [asset1], [link1]);
    expect(result).toHaveLength(1);
    expect(result[0]?.matchStatus).toBe("matched");
    expect(result[0]?.proposedAssetId).toBe(asset1.id);
    expect(result[0]?.proposedAction).toBe("reconcile");
    expect(result[0]?.semanticFingerprint).toBeDefined();
  });

  it("identifies candidate matches needing confirmation by normalized name", () => {
    const row: ParsedCasRow = {
      rowKind: "holding",
      displayName: "Parag Parikh Flexi Cap Fund Direct Plan Growth",
      folioReferenceMasked: "****5678",
      quantityMicroUnits: 50_000_000,
      proposedAction: "reconcile"
    };

    const result = matcher.matchRows([row], [asset1], []);
    expect(result).toHaveLength(1);
    expect(result[0]?.matchStatus).toBe("needs_confirmation");
    expect(result[0]?.proposedAssetId).toBe(asset1.id);
    expect(result[0]?.warningCode).toBe("name_match_only");
  });

  it("marks unrecognized scheme as unmatched with create_asset action", () => {
    const row: ParsedCasRow = {
      rowKind: "transaction",
      displayName: "Quant Small Cap Fund Direct Growth",
      isin: "INF966L01AA3",
      folioReferenceMasked: "****9999",
      transactionType: "purchase",
      occurredAt: new Date("2026-01-15"),
      quantityMicroUnits: 15_000_000,
      grossAmountMinor: 500000,
      proposedAction: "append_event"
    };

    const result = matcher.matchRows([row], [asset1], [link1]);
    expect(result).toHaveLength(1);
    expect(result[0]?.matchStatus).toBe("unmatched");
    expect(result[0]?.proposedAssetId).toBeUndefined();
    expect(result[0]?.proposedAction).toBe("create_asset");
  });
});
