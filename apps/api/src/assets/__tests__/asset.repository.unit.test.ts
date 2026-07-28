import { describe, expect, it } from "vitest";

import { createMockDrizzleDb } from "../../test/mock-drizzle.js";
import { AssetRepository } from "../asset.repository.js";

describe("AssetRepository Unit Tests", () => {
  const sampleAssetRow = {
    id: "123e4567-e89b-12d3-a456-426614174000",
    userId: "u1",
    kind: "gold",
    name: "SGB Gold",
    openedAt: new Date("2026-01-01"),
    maturityAt: new Date("2034-01-01"),
    annualRateBps: 250,
    quantityMilliUnits: 10000,
    isClosed: false,
    createdAt: new Date(),
    updatedAt: new Date()
  };

  it("create inserts asset", async () => {
    const mockDb = createMockDrizzleDb([sampleAssetRow]);
    const repo = new AssetRepository(mockDb);

    const res = await repo.create(
      "u1",
      {
        kind: "gold",
        name: "SGB Gold",
        openingValueMinor: 50000,
        openedAt: new Date("2026-01-01")
      },
      // @ts-expect-error mock tx
      mockDb
    );
    expect(res.name).toBe("SGB Gold");
  });

  it("list returns active assets", async () => {
    const mockDb = createMockDrizzleDb([sampleAssetRow]);
    const repo = new AssetRepository(mockDb);

    const res = await repo.list("u1");
    expect(res).toHaveLength(1);
  });

  it("findOpenById returns asset or null", async () => {
    const mockDb = createMockDrizzleDb([sampleAssetRow]);
    const repo = new AssetRepository(mockDb);

    // @ts-expect-error mock tx
    const res = await repo.findOpenById("u1", sampleAssetRow.id, mockDb);
    expect(res?.id).toBe(sampleAssetRow.id);
  });

  it("close returns true on single update", async () => {
    const mockDb = createMockDrizzleDb([{ id: sampleAssetRow.id }]);
    const repo = new AssetRepository(mockDb);

    // @ts-expect-error mock tx
    const res = await repo.close("u1", sampleAssetRow.id, mockDb);
    expect(res).toBe(true);
  });
});
