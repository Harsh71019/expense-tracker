import { describe, expect, it, vi } from "vitest";

import { focusedTestDouble } from "../../test/mock-drizzle.js";
import { ReserveSourceDiagnosticReadService } from "../reserve-source-diagnostic-read.service.js";
import type { AccountRepository } from "../../accounts/account.repository.js";
import type { AssetReserveCandidateReadService } from "../../assets/asset-reserve-candidate-read.service.js";
import type { ReserveSourceRepository } from "../reserve-source.repository.js";

const ASOF = new Date("2026-08-18T00:00:00.000Z");

function buildService(overrides: {
  accounts?: unknown[];
  assets?: unknown[];
  configurations?: Map<string, unknown>;
}): ReserveSourceDiagnosticReadService {
  const mockAccounts = { listAll: vi.fn().mockResolvedValue(overrides.accounts ?? []) };
  const mockAssets = { listCandidates: vi.fn().mockResolvedValue(overrides.assets ?? []) };
  const mockReserveSources = {
    listActiveByUser: vi.fn().mockResolvedValue(overrides.configurations ?? new Map())
  };

  return new ReserveSourceDiagnosticReadService(
    focusedTestDouble<ReserveSourceRepository>(mockReserveSources),
    focusedTestDouble<AccountRepository>(mockAccounts),
    focusedTestDouble<AssetReserveCandidateReadService>(mockAssets)
  );
}

describe("ReserveSourceDiagnosticReadService", () => {
  it("reports hasCandidates=false and zero counts with no accounts or assets", async () => {
    const service = buildService({});
    const facts = await service.getReserveSourceDiagnosticFacts("user-1", ASOF);
    expect(facts).toEqual({
      hasCandidates: false,
      configuredSourceCount: 0,
      currentlyEligibleSourceCount: 0,
      missingOrStaleConfiguredCount: 0,
      lastUpdatedAt: null
    });
  });

  it("never returns any field shaped like an amount", async () => {
    const service = buildService({
      accounts: [
        {
          id: "11111111-1111-4111-8111-111111111111",
          name: "HDFC Savings",
          type: "bank",
          isArchived: false,
          balanceMinor: 500_000,
          updatedAt: ASOF,
          createdAt: ASOF
        }
      ]
    });
    const facts = await service.getReserveSourceDiagnosticFacts("user-1", ASOF);
    const keys = Object.keys(facts);
    for (const key of keys) {
      expect(key.toLowerCase()).not.toMatch(/minor|amount/);
    }
  });

  it("counts a currently eligible, included, instant account", async () => {
    const accountId = "11111111-1111-4111-8111-111111111111";
    const service = buildService({
      accounts: [
        {
          id: accountId,
          name: "HDFC Savings",
          type: "bank",
          isArchived: false,
          balanceMinor: 500_000,
          updatedAt: ASOF,
          createdAt: ASOF
        }
      ],
      configurations: new Map([
        [
          `account:${accountId}`,
          {
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
    });

    const facts = await service.getReserveSourceDiagnosticFacts("user-1", ASOF);
    expect(facts.hasCandidates).toBe(true);
    expect(facts.configuredSourceCount).toBe(1);
    expect(facts.currentlyEligibleSourceCount).toBe(1);
    expect(facts.missingOrStaleConfiguredCount).toBe(0);
  });

  it("counts a configured asset with a missing valuation toward missingOrStaleConfiguredCount", async () => {
    const assetId = "22222222-2222-4222-8222-222222222222";
    const service = buildService({
      assets: [
        {
          assetId,
          name: "SBI FD",
          kind: "fixed_deposit",
          isClosed: false,
          currentValueMinor: null,
          valuedAt: null,
          freshnessThresholdDays: 180,
          lastUpdatedAt: ASOF
        }
      ],
      configurations: new Map([
        [
          `asset:${assetId}`,
          {
            configuration: {
              liquidityTier: "t_plus_1",
              isIncluded: true,
              eligibleCapMinor: null,
              effectiveFrom: ASOF,
              configuredAt: ASOF
            }
          }
        ]
      ])
    });

    const facts = await service.getReserveSourceDiagnosticFacts("user-1", ASOF);
    expect(facts.configuredSourceCount).toBe(1);
    expect(facts.currentlyEligibleSourceCount).toBe(0);
    expect(facts.missingOrStaleConfiguredCount).toBe(1);
  });
});
