import { describe, expect, it, vi } from "vitest";

import { NetWorthService } from "../net-worth.service.js";

describe("NetWorthService", () => {
  const sampleAsset = {
    id: "asset_1",
    userId: "u1",
    name: "Gold Investment",
    kind: "gold" as const,
    openedAt: new Date("2026-01-01"),
    isClosed: false,
    createdAt: new Date(),
    updatedAt: new Date()
  };

  const sampleValuation = {
    id: "val_1",
    userId: "u1",
    assetId: "asset_1",
    valueMinor: 50000,
    valuedAt: new Date("2026-01-01"),
    source: "manual" as const,
    createdAt: new Date()
  };

  // Not migrated/linked -- AssetRepository.list() already excludes a
  // backfilled `loan_receivable` (NOT EXISTS on receivables.legacy_asset_id)
  // before NetWorthService ever sees the result, so this mock only needs to
  // model what list() actually returns: an unlinked `loan_receivable` asset
  // (e.g. created with openingValueMinor: 0, so no receivable was linked)
  // must still be counted here, not stripped again by kind (see fix for
  // "Do not exclude unlinked zero-opening loan receivables").
  const unlinkedLoanReceivableAsset = {
    ...sampleAsset,
    id: "asset_2",
    kind: "loan_receivable" as const,
    name: "Informal IOU"
  };
  const unlinkedValuation = { ...sampleValuation, id: "val_2", assetId: "asset_2" };

  it("get calculates net worth from accounts, non-receivable assets, and receivables", async () => {
    const mockAccountRepo = {
      list: vi.fn(async () => [{ id: "acc_1", name: "Savings", balanceMinor: 100000 }])
    };
    const mockAssetRepo = {
      list: vi.fn(async () => [sampleAsset, unlinkedLoanReceivableAsset])
    };
    const mockValRepo = {
      findLatestForAssets: vi.fn(
        async () =>
          new Map([
            ["asset_1", sampleValuation],
            ["asset_2", unlinkedValuation]
          ])
      )
    };
    const mockFundingRepo = {
      listActiveForAssets: vi.fn(async () => [])
    };
    const mockReceivablesRead = {
      listActive: vi.fn(async () => [
        {
          receivableId: "recv_1",
          counterpartyName: "Rohan",
          outstandingMinor: 25000,
          asOf: new Date()
        }
      ])
    };

    const service = new NetWorthService(
      // @ts-expect-error mock service args
      mockAccountRepo,
      mockAssetRepo,
      mockValRepo,
      mockFundingRepo,
      mockReceivablesRead
    );

    const res = await service.get("u1");

    expect(res.netWorthMinor).toBe(225000);
    expect(res.accounts).toHaveLength(1);
    // An unlinked loan_receivable asset is NOT excluded by kind -- only a
    // migrated/linked one is (and that exclusion already happened inside
    // AssetRepository.list(), before this mock's data).
    expect(res.assets).toHaveLength(2);
    expect(res.assets.map((asset) => asset.assetId).sort()).toEqual(["asset_1", "asset_2"]);
    expect(res.receivables).toHaveLength(1);
    expect(res.receivables[0]?.outstandingMinor).toBe(25000);
    expect(mockValRepo.findLatestForAssets).toHaveBeenCalledWith("u1", ["asset_1", "asset_2"]);
  });
});
