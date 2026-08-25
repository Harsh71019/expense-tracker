import { describe, expect, it } from "vitest";

import { createMockDrizzleDb } from "../../test/mock-drizzle.js";
import { ReserveSourceRepository } from "../reserve-source.repository.js";

describe("ReserveSourceRepository Unit Tests", () => {
  const sampleRow = {
    id: "aaaaaaaa-0000-4000-8000-000000000001",
    userId: "u1",
    sourceKind: "account" as const,
    sourceId: "bbbbbbbb-0000-4000-8000-000000000002",
    liquidityTier: "instant" as const,
    isIncluded: true,
    eligibleCapMinor: null,
    effectiveFrom: new Date("2026-08-01T00:00:00.000Z"),
    supersededAt: null,
    revisionOf: null,
    createdAt: new Date("2026-08-01T00:00:00.000Z")
  };

  it("listActiveByUser keys rows by sourceKind:sourceId", async () => {
    const mockDb = createMockDrizzleDb([sampleRow]);
    const repo = new ReserveSourceRepository(mockDb);

    const result = await repo.listActiveByUser("u1");
    expect(result.size).toBe(1);
    const entry = result.get("account:bbbbbbbb-0000-4000-8000-000000000002");
    expect(entry?.configuration.liquidityTier).toBe("instant");
    expect(entry?.configuration.isIncluded).toBe(true);
  });

  it("findActive returns null when no row is present", async () => {
    const mockDb = createMockDrizzleDb([]);
    const repo = new ReserveSourceRepository(mockDb);

    const result = await repo.findActive("u1", "account", sampleRow.sourceId);
    expect(result).toBeNull();
  });

  it("findActive parses the configuration from a matching row", async () => {
    const mockDb = createMockDrizzleDb([sampleRow]);
    const repo = new ReserveSourceRepository(mockDb);

    const result = await repo.findActive("u1", "account", sampleRow.sourceId);
    expect(result?.id).toBe(sampleRow.id);
    expect(result?.configuration.eligibleCapMinor).toBeNull();
  });

  it("supersede returns true only when a row was superseded", async () => {
    const mockDb = createMockDrizzleDb([{ id: sampleRow.id }]);
    const repo = new ReserveSourceRepository(mockDb);

    // @ts-expect-error mock tx
    const result = await repo.supersede("u1", sampleRow.id, new Date(), mockDb);
    expect(result).toBe(true);
  });

  it("supersede returns false when no row matched (already superseded or wrong tenant)", async () => {
    const mockDb = createMockDrizzleDb([]);
    const repo = new ReserveSourceRepository(mockDb);

    // @ts-expect-error mock tx
    const result = await repo.supersede("u1", sampleRow.id, new Date(), mockDb);
    expect(result).toBe(false);
  });

  it("create inserts a new classification row and returns its parsed configuration", async () => {
    const mockDb = createMockDrizzleDb([sampleRow]);
    const repo = new ReserveSourceRepository(mockDb);

    const result = await repo.create(
      "u1",
      "account",
      sampleRow.sourceId,
      { liquidityTier: "instant", isIncluded: true },
      sampleRow.effectiveFrom,
      null,
      // @ts-expect-error mock tx
      mockDb
    );
    expect(result.sourceId).toBe(sampleRow.sourceId);
    expect(result.configuration.liquidityTier).toBe("instant");
  });
});
