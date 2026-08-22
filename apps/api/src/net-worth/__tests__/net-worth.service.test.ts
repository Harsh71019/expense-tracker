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

  const legacyReceivableAsset = {
    ...sampleAsset,
    id: "asset_2",
    kind: "loan_receivable" as const,
    name: "Legacy Loan"
  };

  it("get calculates net worth from accounts, non-receivable assets, and receivables", async () => {
    const mockAccountRepo = {
      list: vi.fn(async () => [{ id: "acc_1", name: "Savings", balanceMinor: 100000 }])
    };
    const mockAssetRepo = {
      list: vi.fn(async () => [sampleAsset, legacyReceivableAsset])
    };
    const mockValRepo = {
      findLatestForAssets: vi.fn(async () => new Map([["asset_1", sampleValuation]]))
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

    // @ts-expect-error mock service args
    const service = new NetWorthService(
      mockAccountRepo,
      mockAssetRepo,
      mockValRepo,
      mockReceivablesRead
    );

    const res = await service.get("u1");

    expect(res.netWorthMinor).toBe(175000);
    expect(res.accounts).toHaveLength(1);
    // A backfilled `loan_receivable` asset is excluded from the asset side.
    expect(res.assets).toHaveLength(1);
    expect(res.assets[0]?.assetId).toBe("asset_1");
    expect(res.receivables).toHaveLength(1);
    expect(res.receivables[0]?.outstandingMinor).toBe(25000);
    expect(mockValRepo.findLatestForAssets).toHaveBeenCalledWith("u1", ["asset_1"]);
  });
});
