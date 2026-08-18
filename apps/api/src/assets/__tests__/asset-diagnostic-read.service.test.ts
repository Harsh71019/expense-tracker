import { describe, expect, it, vi } from "vitest";

import { AssetDiagnosticReadService } from "../asset-diagnostic-read.service.js";

describe("AssetDiagnosticReadService", () => {
  it("computes active assets, missing valuations, and stale valuations via single batch lookup", async () => {
    const asOf = new Date("2026-08-18T10:00:00.000Z");

    const mockAssets = [
      {
        id: "asset-1",
        kind: "investment", // 90 days policy
        updatedAt: new Date("2026-08-10T00:00:00.000Z"),
        createdAt: new Date("2026-08-01T00:00:00.000Z")
      },
      {
        id: "asset-2",
        kind: "fixed_deposit", // 180 days policy
        updatedAt: new Date("2026-08-01T00:00:00.000Z"),
        createdAt: new Date("2026-08-01T00:00:00.000Z")
      },
      {
        id: "asset-3",
        kind: "gold", // 90 days policy, will be stale
        updatedAt: new Date("2026-01-01T00:00:00.000Z"),
        createdAt: new Date("2026-01-01T00:00:00.000Z")
      },
      {
        id: "asset-4",
        kind: "loan_liability", // 90 days policy, will have missing valuation
        updatedAt: new Date("2026-08-01T00:00:00.000Z"),
        createdAt: new Date("2026-08-01T00:00:00.000Z")
      }
    ];

    const mockValuations = [
      {
        assetId: "asset-1",
        valuedAt: new Date("2026-08-05T00:00:00.000Z") // fresh (< 90d)
      },
      {
        assetId: "asset-2",
        valuedAt: new Date("2026-05-01T00:00:00.000Z") // fresh (< 180d)
      },
      {
        assetId: "asset-3",
        valuedAt: new Date("2026-01-01T00:00:00.000Z") // stale (> 90d)
      }
    ];

    let selectCallCount = 0;
    const dbMock = {
      select: vi.fn().mockImplementation(() => {
        selectCallCount += 1;
        if (selectCallCount === 1) {
          // Assets query
          return {
            from: vi.fn().mockReturnValue({
              where: vi.fn().mockReturnValue({
                orderBy: vi.fn().mockResolvedValue(mockAssets)
              })
            })
          };
        }
        // Valuations query
        return {
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              orderBy: vi.fn().mockResolvedValue(mockValuations)
            })
          })
        };
      })
    };

    // @ts-expect-error - mock database connection for unit testing
    const service = new AssetDiagnosticReadService(dbMock);
    const result = await service.getAssetDiagnosticFacts("user-1", asOf);

    expect(result.activeAssetCount).toBe(4);
    expect(result.missingValuationCount).toBe(1); // asset-4
    expect(result.staleValuationCount).toBe(1); // asset-3
    expect(result.hasActiveAssets).toBe(true);
    expect(result.latestValuationAt).toEqual(new Date("2026-08-05T00:00:00.000Z"));
  });

  it("returns zero counts when user has no active assets without querying valuations", async () => {
    const dbMock = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockResolvedValue([])
          })
        })
      })
    };

    // @ts-expect-error - mock database connection for unit testing
    const service = new AssetDiagnosticReadService(dbMock);
    const result = await service.getAssetDiagnosticFacts("user-1");

    expect(result.activeAssetCount).toBe(0);
    expect(result.hasActiveAssets).toBe(false);
    expect(result.missingValuationCount).toBe(0);
    expect(result.staleValuationCount).toBe(0);
    expect(result.latestValuationAt).toBeNull();
  });
});
