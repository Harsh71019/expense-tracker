import { describe, expect, it } from "vitest";

import { createMockDrizzleDb } from "../../test/mock-drizzle.js";
import { AssetReserveCandidateReadService } from "../asset-reserve-candidate-read.service.js";

describe("AssetReserveCandidateReadService", () => {
  const ASOF = new Date("2026-08-18T00:00:00.000Z");
  const assetRow = {
    id: "11111111-1111-4111-8111-111111111111",
    name: "SBI FD",
    kind: "fixed_deposit",
    isClosed: false,
    updatedAt: ASOF,
    createdAt: ASOF
  };

  it("listCandidates returns null value fields when no valuation exists yet", async () => {
    const mockDb = createMockDrizzleDb([assetRow]);
    const service = new AssetReserveCandidateReadService(mockDb);

    const result = await service.listCandidates("user-1", ASOF);
    expect(result).toHaveLength(1);
    expect(result[0]?.currentValueMinor).toBeNull();
    expect(result[0]?.valuedAt).toBeNull();
    expect(result[0]?.freshnessThresholdDays).toBe(180);
  });

  it("uses the correct freshness threshold for an investment asset kind", async () => {
    const mockDb = createMockDrizzleDb([{ ...assetRow, kind: "investment" }]);
    const service = new AssetReserveCandidateReadService(mockDb);

    const result = await service.listCandidates("user-1", ASOF);
    expect(result[0]?.freshnessThresholdDays).toBe(90);
  });

  it("returns an empty array when the user owns no assets", async () => {
    const mockDb = createMockDrizzleDb([]);
    const service = new AssetReserveCandidateReadService(mockDb);

    const result = await service.listCandidates("user-1", ASOF);
    expect(result).toEqual([]);
  });

  it("getCandidate returns null for a non-existent or cross-tenant asset", async () => {
    const mockDb = createMockDrizzleDb([]);
    const service = new AssetReserveCandidateReadService(mockDb);

    const result = await service.getCandidate("user-1", assetRow.id, ASOF);
    expect(result).toBeNull();
  });
});
