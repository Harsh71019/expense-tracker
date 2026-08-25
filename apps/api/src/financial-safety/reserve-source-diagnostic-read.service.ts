import { Injectable } from "@nestjs/common";
import { z } from "zod";

import { AccountRepository } from "../accounts/account.repository.js";
import { AssetReserveCandidateReadService } from "../assets/asset-reserve-candidate-read.service.js";
import { evaluateReserveSources, type ReserveCandidateFact } from "./reserve-value-evaluator.js";
import { ReserveSourceRepository } from "./reserve-source.repository.js";

export const ReserveSourceDiagnosticFactsSchema = z.object({
  hasCandidates: z.boolean(),
  configuredSourceCount: z.number().int().min(0),
  currentlyEligibleSourceCount: z.number().int().min(0),
  missingOrStaleConfiguredCount: z.number().int().min(0),
  lastUpdatedAt: z.coerce.date().nullable()
});

export type ReserveSourceDiagnosticFacts = z.infer<typeof ReserveSourceDiagnosticFactsSchema>;

/**
 * Tenant-scoped narrow read port for reserve source facts consumed by the
 * financial readiness diagnostic.
 *
 * Rules (per docs/features/00-architecture/implementation-contract.md and
 * §10 of the emergency-reserve-sources plan):
 * - Returns counts and a timestamp only. No `amountMinor`-shaped field ever
 *   crosses this boundary -- the full evaluated aggregate is computed
 *   in-process and discarded once the counts are derived.
 * - Read-only; touches no reserve classification, account, or asset row.
 */
@Injectable()
export class ReserveSourceDiagnosticReadService {
  constructor(
    private readonly reserveSources: ReserveSourceRepository,
    private readonly accounts: AccountRepository,
    private readonly assetCandidates: AssetReserveCandidateReadService
  ) {}

  async getReserveSourceDiagnosticFacts(
    userId: string,
    asOf: Date = new Date()
  ): Promise<ReserveSourceDiagnosticFacts> {
    const [accounts, assets, configurations] = await Promise.all([
      this.accounts.listAll(userId),
      this.assetCandidates.listCandidates(userId, asOf),
      this.reserveSources.listActiveByUser(userId)
    ]);

    const candidates: ReserveCandidateFact[] = [
      ...accounts.map((account): ReserveCandidateFact => ({
        sourceKind: "account",
        sourceId: account.id,
        displayName: account.name,
        sourceType: account.type,
        isUnavailable: account.isArchived,
        currentValueMinor: account.balanceMinor,
        valuedAt: null,
        freshnessThresholdDays: null,
        lastUpdatedAt: account.updatedAt,
        configuration: configurations.get(`account:${account.id}`)?.configuration ?? null
      })),
      ...assets.map((asset): ReserveCandidateFact => ({
        sourceKind: "asset",
        sourceId: asset.assetId,
        displayName: asset.name,
        sourceType: asset.kind,
        isUnavailable: asset.isClosed,
        currentValueMinor: asset.currentValueMinor,
        valuedAt: asset.valuedAt,
        freshnessThresholdDays: asset.freshnessThresholdDays,
        lastUpdatedAt: asset.lastUpdatedAt,
        configuration: configurations.get(`asset:${asset.assetId}`)?.configuration ?? null
      }))
    ];

    const { sources, summary } = evaluateReserveSources({ candidates, asOf });

    const missingOrStaleConfiguredCount = sources.filter(
      (source) =>
        source.configuration !== null &&
        (source.exclusionReason === "missing_valuation" ||
          source.exclusionReason === "stale_valuation")
    ).length;

    let lastUpdatedAt: Date | null = null;
    for (const source of sources) {
      const candidateUpdatedAt = source.configuration?.configuredAt ?? source.lastUpdatedAt;
      if (
        candidateUpdatedAt !== null &&
        (lastUpdatedAt === null || candidateUpdatedAt > lastUpdatedAt)
      ) {
        lastUpdatedAt = candidateUpdatedAt;
      }
    }

    return ReserveSourceDiagnosticFactsSchema.parse({
      hasCandidates: candidates.length > 0,
      configuredSourceCount: summary.configuredSourceCount,
      currentlyEligibleSourceCount: summary.currentlyEligibleSourceCount,
      missingOrStaleConfiguredCount,
      lastUpdatedAt
    });
  }
}
