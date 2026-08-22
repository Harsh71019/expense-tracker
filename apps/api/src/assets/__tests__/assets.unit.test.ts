import { describe, expect, it, vi } from "vitest";

import { AssetService } from "../asset.service.js";
import { NetWorthService } from "../net-worth.service.js";

describe("Asset and NetWorth Unit Tests", () => {
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

  describe("AssetService", () => {
    it("addValuation records valuation when asset active", async () => {
      const mockDb = {
        transaction: vi.fn(async (cb: (tx: string) => Promise<unknown>) => cb("tx1"))
      };
      const mockAssetRepo = {
        findOpenById: vi.fn(async () => sampleAsset)
      };
      const mockValRepo = {
        create: vi.fn(async () => sampleValuation)
      };
      const mockAuditRepo = {
        record: vi.fn(async () => undefined)
      };

      // @ts-expect-error mock service args
      const service = new AssetService(mockDb, mockAssetRepo, mockValRepo, mockAuditRepo);

      const res = await service.addValuation("u1", "asset_1", {
        valueMinor: 50000,
        valuedAt: new Date("2026-01-01"),
        source: "manual"
      });

      expect(res.valueMinor).toBe(50000);
    });
  });

  describe("NetWorthService", () => {
    it("get calculates net worth from accounts and asset valuations", async () => {
      const mockAccountRepo = {
        list: vi.fn(async () => [{ id: "acc_1", name: "Savings", balanceMinor: 100000 }])
      };

      const mockAssetRepo = {
        list: vi.fn(async () => [sampleAsset])
      };

      const mockValRepo = {
        findLatestForAssets: vi.fn(async () => new Map([["asset_1", sampleValuation]]))
      };

      // @ts-expect-error mock service args
      const service = new NetWorthService(mockAccountRepo, mockAssetRepo, mockValRepo, {
        listActiveForAssets: vi.fn(async () => [])
      });

      const res = await service.get("u1");

      expect(res.netWorthMinor).toBe(150000);
      expect(res.accounts).toHaveLength(1);
      expect(res.assets).toHaveLength(1);
    });
  });
});
