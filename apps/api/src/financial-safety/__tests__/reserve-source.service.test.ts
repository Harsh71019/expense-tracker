import { beforeEach, describe, expect, it, vi } from "vitest";

import { EntityNotFoundError } from "../../common/errors/entity-not-found.error.js";
import { UnsupportedReserveSourceError } from "../../common/errors/unsupported-reserve-source.error.js";
import { focusedTestDouble } from "../../test/mock-drizzle.js";
import { ReserveSourceService } from "../reserve-source.service.js";
import type { AccountRepository } from "../../accounts/account.repository.js";
import type { AssetReserveCandidateReadService } from "../../assets/asset-reserve-candidate-read.service.js";
import type { AuditRepository } from "../../audit/audit.repository.js";
import type { IdempotencyPostgresService } from "../../common/idempotency/idempotency-postgres.service.js";
import type { ReserveSourceRepository } from "../reserve-source.repository.js";

const ASOF = new Date("2026-08-18T00:00:00.000Z");

describe("ReserveSourceService", () => {
  let service: ReserveSourceService;
  let mockRepository: {
    findActiveForUpdate: ReturnType<typeof vi.fn>;
    supersede: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
  };
  let mockAudit: { record: ReturnType<typeof vi.fn> };
  let mockAccounts: { findById: ReturnType<typeof vi.fn> };
  let mockAssetCandidates: { getCandidate: ReturnType<typeof vi.fn> };
  let mockIdempotency: { execute: ReturnType<typeof vi.fn> };

  const accountRow = {
    id: "11111111-1111-4111-8111-111111111111",
    userId: "user-1",
    name: "HDFC Savings",
    type: "bank" as const,
    isArchived: false,
    balanceMinor: 100_000,
    updatedAt: ASOF,
    createdAt: ASOF
  };

  beforeEach(() => {
    mockRepository = {
      findActiveForUpdate: vi.fn().mockResolvedValue(null),
      supersede: vi.fn().mockResolvedValue(true),
      create: vi.fn().mockResolvedValue({
        id: "cccccccc-0000-4000-8000-000000000001",
        sourceKind: "account",
        sourceId: accountRow.id,
        configuration: {
          liquidityTier: "instant",
          isIncluded: true,
          eligibleCapMinor: null,
          effectiveFrom: ASOF,
          configuredAt: ASOF
        }
      })
    };
    mockAudit = { record: vi.fn().mockResolvedValue(undefined) };
    mockAccounts = { findById: vi.fn().mockResolvedValue(accountRow) };
    mockAssetCandidates = { getCandidate: vi.fn().mockResolvedValue(null) };
    mockIdempotency = {
      execute: vi.fn(
        async (
          _userId: string,
          _op: string,
          _key: string,
          _intent: unknown,
          _schema: unknown,
          work: (tx: unknown) => Promise<unknown>
        ) => ({
          replayed: false,
          result: await work({})
        })
      )
    };

    service = new ReserveSourceService(
      focusedTestDouble<ReserveSourceRepository>(mockRepository),
      focusedTestDouble<AuditRepository>(mockAudit),
      focusedTestDouble<AccountRepository>(mockAccounts),
      focusedTestDouble<AssetReserveCandidateReadService>(mockAssetCandidates),
      focusedTestDouble<IdempotencyPostgresService>(mockIdempotency)
    );
  });

  it("throws EntityNotFoundError for a source that does not belong to the tenant", async () => {
    mockAccounts.findById.mockResolvedValue(null);

    await expect(
      service.updateSource(
        "user-1",
        "account",
        accountRow.id,
        { liquidityTier: "instant", isIncluded: true },
        "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
      )
    ).rejects.toThrow(EntityNotFoundError);
    expect(mockRepository.create).not.toHaveBeenCalled();
  });

  it("rejects classifying a credit_card account as unsupported", async () => {
    mockAccounts.findById.mockResolvedValue({ ...accountRow, type: "credit_card" });

    await expect(
      service.updateSource(
        "user-1",
        "account",
        accountRow.id,
        { liquidityTier: "instant", isIncluded: true },
        "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
      )
    ).rejects.toThrow(UnsupportedReserveSourceError);
    expect(mockRepository.create).not.toHaveBeenCalled();
  });

  it("rejects classifying an investment account as unsupported", async () => {
    mockAccounts.findById.mockResolvedValue({ ...accountRow, type: "investment" });

    await expect(
      service.updateSource(
        "user-1",
        "account",
        accountRow.id,
        { liquidityTier: "t_plus_1", isIncluded: true },
        "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
      )
    ).rejects.toThrow(UnsupportedReserveSourceError);
  });

  it("rejects a gold asset classified as instant", async () => {
    mockAssetCandidates.getCandidate.mockResolvedValue({
      assetId: "22222222-2222-4222-8222-222222222222",
      name: "Gold Bar",
      kind: "gold",
      isClosed: false,
      currentValueMinor: 300_000,
      valuedAt: ASOF,
      freshnessThresholdDays: 90,
      lastUpdatedAt: ASOF
    });

    await expect(
      service.updateSource(
        "user-1",
        "asset",
        "22222222-2222-4222-8222-222222222222",
        { liquidityTier: "instant", isIncluded: true },
        "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
      )
    ).rejects.toThrow(UnsupportedReserveSourceError);
  });

  it("allows a gold asset classified as locked", async () => {
    mockAssetCandidates.getCandidate.mockResolvedValue({
      assetId: "22222222-2222-4222-8222-222222222222",
      name: "Gold Bar",
      kind: "gold",
      isClosed: false,
      currentValueMinor: 300_000,
      valuedAt: ASOF,
      freshnessThresholdDays: 90,
      lastUpdatedAt: ASOF
    });
    mockRepository.create.mockResolvedValue({
      id: "dddddddd-0000-4000-8000-000000000001",
      sourceKind: "asset",
      sourceId: "22222222-2222-4222-8222-222222222222",
      configuration: {
        liquidityTier: "locked",
        isIncluded: true,
        eligibleCapMinor: null,
        effectiveFrom: ASOF,
        configuredAt: ASOF
      }
    });

    const result = await service.updateSource(
      "user-1",
      "asset",
      "22222222-2222-4222-8222-222222222222",
      { liquidityTier: "locked", isIncluded: true },
      "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
    );
    expect(result.result.exclusionReason).toBe("locked");
  });

  it("rejects an investment asset classified as instant", async () => {
    mockAssetCandidates.getCandidate.mockResolvedValue({
      assetId: "33333333-3333-4333-8333-333333333333",
      name: "Index Fund",
      kind: "investment",
      isClosed: false,
      currentValueMinor: 500_000,
      valuedAt: ASOF,
      freshnessThresholdDays: 90,
      lastUpdatedAt: ASOF
    });

    await expect(
      service.updateSource(
        "user-1",
        "asset",
        "33333333-3333-4333-8333-333333333333",
        { liquidityTier: "instant", isIncluded: true },
        "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
      )
    ).rejects.toThrow(UnsupportedReserveSourceError);
  });

  it("appends the first classification and writes a create audit entry when none is active", async () => {
    const result = await service.updateSource(
      "user-1",
      "account",
      accountRow.id,
      { liquidityTier: "instant", isIncluded: true },
      "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
    );

    expect(mockRepository.create).toHaveBeenCalledWith(
      "user-1",
      "account",
      accountRow.id,
      { liquidityTier: "instant", isIncluded: true },
      expect.any(Date),
      null,
      expect.anything()
    );
    expect(mockAudit.record).toHaveBeenCalledWith(
      "user-1",
      "financial_safety.reserve_source.create",
      expect.any(String),
      expect.anything(),
      expect.objectContaining({ sourceKind: "account", sourceId: accountRow.id })
    );
    expect(result.result.sourceId).toBe(accountRow.id);
    expect(mockRepository.supersede).not.toHaveBeenCalled();
  });

  it("supersedes the active classification and appends a revision, writing a revise audit entry", async () => {
    mockRepository.findActiveForUpdate.mockResolvedValue({
      id: "eeeeeeee-0000-4000-8000-000000000001",
      sourceKind: "account",
      sourceId: accountRow.id,
      configuration: {
        liquidityTier: "instant",
        isIncluded: true,
        eligibleCapMinor: null,
        effectiveFrom: ASOF,
        configuredAt: ASOF
      }
    });

    await service.updateSource(
      "user-1",
      "account",
      accountRow.id,
      { liquidityTier: "locked", isIncluded: true },
      "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
    );

    expect(mockRepository.supersede).toHaveBeenCalledWith(
      "user-1",
      "eeeeeeee-0000-4000-8000-000000000001",
      expect.any(Date),
      expect.anything()
    );
    expect(mockRepository.create).toHaveBeenCalledWith(
      "user-1",
      "account",
      accountRow.id,
      { liquidityTier: "locked", isIncluded: true },
      expect.any(Date),
      "eeeeeeee-0000-4000-8000-000000000001",
      expect.anything()
    );
    expect(mockAudit.record).toHaveBeenCalledWith(
      "user-1",
      "financial_safety.reserve_source.revise",
      expect.any(String),
      expect.anything(),
      expect.objectContaining({ supersededId: "eeeeeeee-0000-4000-8000-000000000001" })
    );
  });

  it("never mutates the account or asset it classifies", async () => {
    await service.updateSource(
      "user-1",
      "account",
      accountRow.id,
      { liquidityTier: "instant", isIncluded: true },
      "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
    );

    // Only a read (`findById`); no update/insert method on the accounts port
    // was invoked because the mock double never defines one to call.
    expect(mockAccounts.findById).toHaveBeenCalled();
  });

  it("delegates idempotency handling to IdempotencyPostgresService with a stable operation name", async () => {
    await service.updateSource(
      "user-1",
      "account",
      accountRow.id,
      { liquidityTier: "instant", isIncluded: true },
      "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
    );

    expect(mockIdempotency.execute).toHaveBeenCalledWith(
      "user-1",
      "financial_safety.reserve_source.update",
      "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      expect.objectContaining({ sourceKind: "account", sourceId: accountRow.id }),
      expect.anything(),
      expect.any(Function)
    );
  });
});
