import { Injectable } from "@nestjs/common";
import {
  ReserveSourceSchema,
  type ReserveSource,
  type ReserveSourceKind,
  type UpdateReserveSource
} from "@treasury-ops/shared";

import { AccountRepository } from "../accounts/account.repository.js";
import { AssetReserveCandidateReadService } from "../assets/asset-reserve-candidate-read.service.js";
import { AuditRepository } from "../audit/audit.repository.js";
import type { DbTx } from "../common/db/db-txn.js";
import { EntityNotFoundError } from "../common/errors/entity-not-found.error.js";
import { UnsupportedReserveSourceError } from "../common/errors/unsupported-reserve-source.error.js";
import {
  IdempotencyPostgresService,
  type IdempotentResult
} from "../common/idempotency/idempotency-postgres.service.js";
import { evaluateReserveCandidate, type ReserveCandidateFact } from "./reserve-value-evaluator.js";
import { getAllowedLiquidityTiers, isConfigurableReserveSource } from "./reserve-source-policy.js";
import { ReserveSourceRepository } from "./reserve-source.repository.js";

/**
 * Orchestrates reserve source classification mutations.
 *
 * Rules:
 * - Validates source ownership against the correct domain table (accounts or
 *   assets) before writing -- a `sourceId` is never trusted from the request.
 * - Rejects structurally unsupported source kinds/tiers via
 *   `reserve-source-policy.ts` (one policy, enforced once, at write time).
 * - Every mutation appends a new classification version inside `withTxn` via
 *   `IdempotencyPostgresService`: classification write + idempotency record +
 *   audit entry all commit or roll back together.
 * - Never changes an account balance, an asset valuation, or writes to the
 *   ledger.
 */
@Injectable()
export class ReserveSourceService {
  constructor(
    private readonly repository: ReserveSourceRepository,
    private readonly audit: AuditRepository,
    private readonly accounts: AccountRepository,
    private readonly assetCandidates: AssetReserveCandidateReadService,
    private readonly idempotency: IdempotencyPostgresService
  ) {}

  async updateSource(
    userId: string,
    sourceKind: ReserveSourceKind,
    sourceId: string,
    input: UpdateReserveSource,
    idempotencyKey: string
  ): Promise<IdempotentResult<ReserveSource>> {
    return this.idempotency.execute(
      userId,
      "financial_safety.reserve_source.update",
      idempotencyKey,
      { sourceKind, sourceId, input },
      ReserveSourceSchema,
      (tx) => this.updateSourceInTx(userId, sourceKind, sourceId, input, tx)
    );
  }

  private async updateSourceInTx(
    userId: string,
    sourceKind: ReserveSourceKind,
    sourceId: string,
    input: UpdateReserveSource,
    tx: DbTx
  ): Promise<ReserveSource> {
    const asOf = new Date();
    const candidate = await this.loadCandidateFact(userId, sourceKind, sourceId, asOf, null);
    if (candidate === null) {
      throw new EntityNotFoundError("Reserve source");
    }

    if (!isConfigurableReserveSource(sourceKind, candidate.sourceType)) {
      throw new UnsupportedReserveSourceError(
        `A ${sourceKind} of type "${candidate.sourceType}" cannot be classified as an emergency reserve.`
      );
    }

    const allowedTiers = getAllowedLiquidityTiers(sourceKind, candidate.sourceType);
    if (!allowedTiers.includes(input.liquidityTier)) {
      throw new UnsupportedReserveSourceError(
        `A ${sourceKind} of type "${candidate.sourceType}" only supports liquidity tier(s): ${allowedTiers.join(", ")}.`
      );
    }

    const active = await this.repository.findActiveForUpdate(userId, sourceKind, sourceId, tx);
    const effectiveFrom = input.effectiveFrom ?? asOf;

    if (active === null) {
      const created = await this.repository.create(
        userId,
        sourceKind,
        sourceId,
        input,
        effectiveFrom,
        null,
        tx
      );
      await this.audit.record(userId, "financial_safety.reserve_source.create", created.id, tx, {
        sourceKind,
        sourceId,
        liquidityTier: input.liquidityTier,
        isIncluded: input.isIncluded
      });
      return evaluateReserveCandidate({ ...candidate, configuration: created.configuration }, asOf);
    }

    const superseded = await this.repository.supersede(userId, active.id, asOf, tx);
    if (!superseded) {
      throw new EntityNotFoundError("Reserve source classification");
    }
    const created = await this.repository.create(
      userId,
      sourceKind,
      sourceId,
      input,
      effectiveFrom,
      active.id,
      tx
    );
    await this.audit.record(userId, "financial_safety.reserve_source.revise", created.id, tx, {
      sourceKind,
      sourceId,
      liquidityTier: input.liquidityTier,
      isIncluded: input.isIncluded,
      supersededId: active.id
    });
    return evaluateReserveCandidate({ ...candidate, configuration: created.configuration }, asOf);
  }

  /** Loads the account/asset facts for one source, `null` if it does not exist for this tenant. `configuration` is always attached by the caller. */
  private async loadCandidateFact(
    userId: string,
    sourceKind: ReserveSourceKind,
    sourceId: string,
    asOf: Date,
    configuration: ReserveCandidateFact["configuration"]
  ): Promise<ReserveCandidateFact | null> {
    if (sourceKind === "account") {
      const account = await this.accounts.findById(userId, sourceId);
      if (account === null) return null;
      return {
        sourceKind: "account",
        sourceId: account.id,
        displayName: account.name,
        sourceType: account.type,
        isUnavailable: account.isArchived,
        currentValueMinor: account.balanceMinor,
        valuedAt: null,
        freshnessThresholdDays: null,
        lastUpdatedAt: account.updatedAt,
        configuration
      };
    }

    const asset = await this.assetCandidates.getCandidate(userId, sourceId, asOf);
    if (asset === null) return null;
    return {
      sourceKind: "asset",
      sourceId: asset.assetId,
      displayName: asset.name,
      sourceType: asset.kind,
      isUnavailable: asset.isClosed,
      currentValueMinor: asset.currentValueMinor,
      valuedAt: asset.valuedAt,
      freshnessThresholdDays: asset.freshnessThresholdDays,
      lastUpdatedAt: asset.lastUpdatedAt,
      configuration
    };
  }
}
