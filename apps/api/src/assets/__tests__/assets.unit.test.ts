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
      const mockReceivableService = {
        findByLegacyAssetId: vi.fn(async () => null)
      };

      const service = new AssetService(
        // @ts-expect-error mock service args
        mockDb,
        mockAssetRepo,
        mockValRepo,
        mockAuditRepo,
        mockReceivableService
      );

      const res = await service.addValuation("u1", "asset_1", {
        valueMinor: 50000,
        valuedAt: new Date("2026-01-01"),
        source: "manual"
      });

      expect(res.valueMinor).toBe(50000);
    });
  });
  // NetWorthService moved to apps/api/src/net-worth/net-worth.service.ts
  // (see net-worth/__tests__/net-worth.service.test.ts for its coverage,
  // now also mocking AssetFundingRepository per main's asset-funding work).
});
