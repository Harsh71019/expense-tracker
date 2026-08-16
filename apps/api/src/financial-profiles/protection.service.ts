import { Injectable } from "@nestjs/common";
import {
  ProtectionSnapshotSchema,
  type ProtectionSnapshot,
  type ProtectionState,
  type UpsertProtection
} from "@treasury-ops/shared";

import { AuditRepository } from "../audit/audit.repository.js";
import { postgresConstraint } from "../common/db/postgres-error.js";
import { DuplicateProtectionEffectiveDateError } from "../common/errors/duplicate-protection-effective-date.error.js";
import { InvalidProtectionCombinationError } from "../common/errors/invalid-protection-combination.error.js";
import {
  IdempotencyPostgresService,
  type IdempotentResult
} from "../common/idempotency/idempotency-postgres.service.js";
import { istCalendarDateStartUtc } from "../common/time/ist.js";
import { deriveProtectionState } from "./protection-state.js";
import { ProtectionRepository } from "./protection.repository.js";

const EFFECTIVE_DATE_CONSTRAINT = "protection_snapshots_user_id_effective_from_unique";
const COMBINATION_CONSTRAINTS = new Set([
  "protection_snapshots_not_applicable_reason_valid",
  "protection_snapshots_term_cover_source_valid",
  "protection_snapshots_health_cover_source_valid",
  "protection_snapshots_cover_amounts_positive",
  "protection_snapshots_dependant_count_valid"
]);

/**
 * Business rules for protection facts. Records what the user tells us and
 * derives read-only states from it. It moves no money, touches no ledger row,
 * and never contributes to net worth — insurance cover is a protection fact,
 * not an asset.
 */
@Injectable()
export class ProtectionService {
  constructor(
    private readonly protection: ProtectionRepository,
    private readonly audit: AuditRepository,
    private readonly idempotency: IdempotencyPostgresService
  ) {}

  async getState(userId: string, asOf: Date = new Date()): Promise<ProtectionState> {
    const [snapshot, upcomingSnapshot] = await Promise.all([
      this.protection.findEffectiveSnapshot(userId, asOf),
      this.protection.findUpcomingSnapshot(userId, asOf)
    ]);
    return deriveProtectionState({ snapshot, upcomingSnapshot, asOf });
  }

  /**
   * Appends an effective-dated snapshot. Historical snapshots are never
   * rewritten, so a corrected answer is a new snapshot on a new effective date;
   * the same date twice is a conflict, not an overwrite.
   *
   * `effectiveFrom` is normalized to the start of its Asia/Kolkata calendar day
   * so "effective 1 April" means the same instant regardless of the time
   * component the client happened to send.
   */
  upsertProtection(
    userId: string,
    input: UpsertProtection,
    key: string
  ): Promise<IdempotentResult<ProtectionSnapshot>> {
    const effectiveFrom = istCalendarDateStartUtc(input.effectiveFrom);
    const intent = {
      ...input,
      effectiveFrom,
      independentTermExpiresOn:
        input.independentTermExpiresOn === null
          ? null
          : istCalendarDateStartUtc(input.independentTermExpiresOn),
      independentHealthExpiresOn:
        input.independentHealthExpiresOn === null
          ? null
          : istCalendarDateStartUtc(input.independentHealthExpiresOn)
    };

    return this.idempotency.execute(
      userId,
      "financial_profile.protection.upsert",
      key,
      intent,
      ProtectionSnapshotSchema,
      async (tx) => {
        let snapshot: ProtectionSnapshot;
        try {
          snapshot = await this.protection.createSnapshot(userId, intent, tx);
        } catch (error) {
          const constraint = postgresConstraint(error);
          if (constraint === EFFECTIVE_DATE_CONSTRAINT) {
            throw new DuplicateProtectionEffectiveDateError();
          }
          if (constraint !== undefined && COMBINATION_CONSTRAINTS.has(constraint)) {
            throw new InvalidProtectionCombinationError();
          }
          throw error;
        }

        // Audit records shape and ownership only. No cover amount, no dependant
        // detail, no request body — those are confidential and never leave the
        // row they were written to.
        await this.audit.record(userId, "financial_profile.protection.upsert", snapshot.id, tx, {
          effectiveFrom: snapshot.effectiveFrom.toISOString(),
          termCoverStatus: snapshot.termCoverStatus,
          healthCoverStatus: snapshot.healthCoverStatus,
          hasIndependentTermCover: snapshot.independentTermCoverMinor !== null,
          hasEmployerTermCover: snapshot.employerTermCoverMinor !== null,
          hasIndependentHealthCover: snapshot.independentHealthBaseCoverMinor !== null,
          hasEmployerHealthCover: snapshot.employerHealthCoverMinor !== null,
          hasTermNotApplicableReason: snapshot.termNotApplicableReason !== null
        });
        return snapshot;
      }
    );
  }
}
