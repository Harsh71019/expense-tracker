import { describe, expect, it, vi } from "vitest";

import { AssetService } from "../asset.service.js";

describe("Asset Unit Tests", () => {
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
      const mockReceivableService = {};
      const mockReceivableRepo = {
        findByLegacyAssetId: vi.fn(async () => null)
      };

      // @ts-expect-error mock service args
      const service = new AssetService(
        mockDb,
        mockAssetRepo,
        mockValRepo,
        mockAuditRepo,
        mockReceivableService,
        mockReceivableRepo
      );

      const res = await service.addValuation("u1", "asset_1", {
        valueMinor: 50000,
        valuedAt: new Date("2026-01-01"),
        source: "manual"
      });

      expect(res.valueMinor).toBe(50000);
    });
  });
});
