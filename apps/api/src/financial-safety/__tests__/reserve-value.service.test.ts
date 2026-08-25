import { beforeEach, describe, expect, it, vi } from "vitest";

import { focusedTestDouble } from "../../test/mock-drizzle.js";
import { ReserveValueService, type ReserveValueLogger } from "../reserve-value.service.js";
import type { AccountRepository } from "../../accounts/account.repository.js";
import type { AssetReserveCandidateReadService } from "../../assets/asset-reserve-candidate-read.service.js";
import type { ReserveSourceRepository } from "../reserve-source.repository.js";

const ASOF = new Date("2026-08-18T00:00:00.000Z");

describe("ReserveValueService", () => {
  let service: ReserveValueService;
  let mockAccounts: { listAll: ReturnType<typeof vi.fn> };
  let mockAssetCandidates: { listCandidates: ReturnType<typeof vi.fn> };
  let mockReserveSources: { listActiveByUser: ReturnType<typeof vi.fn> };
  let mockLogger: {
    log: ReturnType<typeof vi.fn>;
    error: ReturnType<typeof vi.fn>;
    warn: ReturnType<typeof vi.fn>;
  };

  const accountA = {
    id: "11111111-1111-4111-8111-111111111111",
    name: "HDFC Savings",
    type: "bank" as const,
    isArchived: false,
    balanceMinor: 100_000,
    updatedAt: ASOF,
    createdAt: ASOF
  };
  const accountB = {
    id: "22222222-2222-4222-8222-222222222222",
    name: "ICICI Wallet",
    type: "wallet" as const,
    isArchived: false,
    balanceMinor: 50_000,
    updatedAt: ASOF,
    createdAt: ASOF
  };

  beforeEach(() => {
    mockAccounts = { listAll: vi.fn().mockResolvedValue([accountA, accountB]) };
    mockAssetCandidates = { listCandidates: vi.fn().mockResolvedValue([]) };
    mockReserveSources = {
      listActiveByUser: vi.fn().mockResolvedValue(
        new Map([
          [
            `account:${accountA.id}`,
            {
              id: "cccccccc-0000-4000-8000-000000000001",
              sourceKind: "account",
              sourceId: accountA.id,
              configuration: {
                liquidityTier: "instant",
                isIncluded: true,
                eligibleCapMinor: null,
                effectiveFrom: ASOF,
                configuredAt: ASOF
              }
            }
          ]
        ])
      )
    };
    mockLogger = { log: vi.fn(), error: vi.fn(), warn: vi.fn() };

    service = new ReserveValueService(
      focusedTestDouble<ReserveValueLogger>(mockLogger),
      focusedTestDouble<ReserveSourceRepository>(mockReserveSources),
      focusedTestDouble<AccountRepository>(mockAccounts),
      focusedTestDouble<AssetReserveCandidateReadService>(mockAssetCandidates)
    );
  });

  it("lists every account/asset candidate merged with its configuration", async () => {
    const page = await service.listSources("user-1", { limit: 50 });
    expect(page.items).toHaveLength(2);
    const configured = page.items.find((item) => item.sourceId === accountA.id);
    expect(configured?.configuration).not.toBeNull();
    expect(configured?.eligibility).toBe("eligible");
    const unconfigured = page.items.find((item) => item.sourceId === accountB.id);
    expect(unconfigured?.configuration).toBeNull();
    expect(unconfigured?.exclusionReason).toBe("not_configured");
  });

  it("filters by configured=true", async () => {
    const page = await service.listSources("user-1", { limit: 50, configured: true });
    expect(page.items).toHaveLength(1);
    expect(page.items[0]?.sourceId).toBe(accountA.id);
  });

  it("filters by eligible=false", async () => {
    const page = await service.listSources("user-1", { limit: 50, eligible: false });
    expect(page.items.every((item) => item.eligibility === "ineligible")).toBe(true);
  });

  it("paginates with a stable cursor and hasMore flag", async () => {
    const firstPage = await service.listSources("user-1", { limit: 1 });
    expect(firstPage.items).toHaveLength(1);
    expect(firstPage.pageInfo.hasMore).toBe(true);
    expect(firstPage.pageInfo.nextCursor).not.toBeNull();

    const cursor = firstPage.pageInfo.nextCursor;
    if (cursor === null) throw new Error("expected a cursor");
    const secondPage = await service.listSources("user-1", { limit: 1, cursor });
    expect(secondPage.items).toHaveLength(1);
    expect(secondPage.items[0]?.sourceId).not.toBe(firstPage.items[0]?.sourceId);
    expect(secondPage.pageInfo.hasMore).toBe(false);
  });

  it("getSummary returns the evaluator's aggregate and logs only counts/statuses", async () => {
    const summary = await service.getSummary("user-1", ASOF);
    expect(summary.instantMinor).toBe(100_000);
    expect(summary.configuredSourceCount).toBe(1);

    expect(mockLogger.log).toHaveBeenCalled();
    const [payload] = mockLogger.log.mock.calls[0] ?? [];
    const serialized = JSON.stringify(payload);
    expect(serialized).not.toMatch(/instantMinor|totalEligibleMinor|balanceMinor/);
    expect(payload).toHaveProperty("event", "financial_safety.reserves_evaluated");
  });

  it("defaults asOf to now when not provided", async () => {
    const before = new Date();
    await service.getSummary("user-1");
    expect(mockAssetCandidates.listCandidates).toHaveBeenCalledWith("user-1", expect.any(Date));
    const call = mockAssetCandidates.listCandidates.mock.calls[0];
    expect(call).toBeDefined();
    const calledAsOf: unknown = call?.[1];
    expect(calledAsOf).toBeInstanceOf(Date);
    if (calledAsOf instanceof Date) {
      expect(calledAsOf.getTime()).toBeGreaterThanOrEqual(before.getTime());
    }
  });
});
