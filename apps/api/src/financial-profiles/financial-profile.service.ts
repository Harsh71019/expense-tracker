import { Injectable } from "@nestjs/common";
import {
  FinancialProfileSchema,
  FinancialProfileStateSchema,
  SalaryVersionSchema,
  SUGGESTED_MONTHLY_WORK_MINUTES,
  type CreateSalaryVersion,
  type FinancialProfile,
  type FinancialProfileState,
  type FinancialProfileUpdate,
  type ListSalaryVersionsQuery,
  type SalaryStatistics,
  type SalaryVersion,
  type SalaryVersionPage
} from "@treasury-ops/shared";

import { AuditRepository } from "../audit/audit.repository.js";
import { istCalendarDateStartUtc } from "../common/time/ist.js";
import { DuplicateSalaryEffectiveDateError } from "../common/errors/duplicate-salary-effective-date.error.js";
import { FinancialProfileNotConfiguredError } from "../common/errors/financial-profile-not-configured.error.js";
import { MoneyOutOfRangeError } from "../common/errors/money-out-of-range.error.js";
import { postgresConstraint } from "../common/db/postgres-error.js";
import {
  IdempotencyPostgresService,
  type IdempotentResult
} from "../common/idempotency/idempotency-postgres.service.js";
import { FinancialProfileRepository } from "./financial-profile.repository.js";
import { calculateSalaryStatistics } from "./salary-statistics.js";

const EFFECTIVE_DATE_CONSTRAINT = "salary_versions_user_id_effective_from_unique";

/**
 * Business rules for salary and work facts. Holds no money-moving path — this
 * module records what the user tells us and derives read-only statistics; the
 * ledger is untouched.
 */
@Injectable()
export class FinancialProfileService {
  constructor(
    private readonly profiles: FinancialProfileRepository,
    private readonly audit: AuditRepository,
    private readonly idempotency: IdempotencyPostgresService
  ) {}

  /**
   * The explicit setup state. A user with no profile or no effective salary
   * gets `configured: false` and the one value we may propose (160 h/month),
   * never a fabricated salary.
   */
  async getState(userId: string, asOf: Date = new Date()): Promise<FinancialProfileState> {
    const [profile, currentSalaryVersion, upcomingSalaryVersion] = await Promise.all([
      this.profiles.findProfile(userId),
      this.profiles.findEffectiveSalaryVersion(userId, asOf),
      this.profiles.findUpcomingSalaryVersion(userId, asOf)
    ]);

    return FinancialProfileStateSchema.parse({
      configured: profile !== null && currentSalaryVersion !== null,
      profile,
      currentSalaryVersion,
      upcomingSalaryVersion,
      suggestedMonthlyWorkMinutes: SUGGESTED_MONTHLY_WORK_MINUTES,
      asOf
    });
  }

  updateProfile(
    userId: string,
    input: FinancialProfileUpdate,
    key: string
  ): Promise<IdempotentResult<FinancialProfile>> {
    return this.idempotency.execute(
      userId,
      "financial_profile.update",
      key,
      input,
      FinancialProfileSchema,
      async (tx) => {
        const profile = await this.profiles.upsertProfile(userId, input, tx);
        // Audit records what changed and who owns it — never a salary or CTC value.
        await this.audit.record(userId, "financial_profile.update", userId, tx, {
          monthlyWorkMinutes: profile.monthlyWorkMinutes,
          incomeStability: profile.incomeStability,
          hasSalaryCreditDay: profile.salaryCreditDay !== null,
          hasExpectedAnnualIncrement: profile.expectedAnnualIncrementBps !== null
        });
        return profile;
      }
    );
  }

  /**
   * Appends a salary version. Historical versions are never rewritten, so a
   * correction is a new version on a new effective date; the same date twice
   * is a conflict, not an overwrite.
   *
   * `effectiveFrom` is normalized to the start of its Asia/Kolkata calendar
   * day so "effective 1 April" means the same instant regardless of the time
   * component the client happened to send.
   */
  addSalaryVersion(
    userId: string,
    input: CreateSalaryVersion,
    key: string
  ): Promise<IdempotentResult<SalaryVersion>> {
    const effectiveFrom = istCalendarDateStartUtc(input.effectiveFrom);
    const intent = {
      netMonthlySalaryMinor: input.netMonthlySalaryMinor,
      annualCtcMinor: input.annualCtcMinor,
      effectiveFrom
    };

    return this.idempotency.execute(
      userId,
      "financial_profile.salary_version.create",
      key,
      intent,
      SalaryVersionSchema,
      async (tx) => {
        let version: SalaryVersion;
        try {
          version = await this.profiles.createSalaryVersion(
            userId,
            { ...intent, source: "manually_confirmed" },
            tx
          );
        } catch (error) {
          if (postgresConstraint(error) === EFFECTIVE_DATE_CONSTRAINT) {
            throw new DuplicateSalaryEffectiveDateError();
          }
          throw error;
        }

        await this.audit.record(userId, "financial_profile.salary_version.create", version.id, tx, {
          effectiveFrom: version.effectiveFrom.toISOString(),
          source: version.source,
          hasAnnualCtc: version.annualCtcMinor !== null
        });
        return version;
      }
    );
  }

  async listSalaryVersions(
    userId: string,
    query: ListSalaryVersionsQuery
  ): Promise<SalaryVersionPage> {
    const page = await this.profiles.listSalaryVersions(userId, {
      cursor: query.cursor,
      limit: query.limit
    });
    return {
      items: page.items,
      pageInfo: { nextCursor: page.nextCursor, hasMore: page.hasMore, limit: query.limit }
    };
  }

  /**
   * Server-authoritative derived salary figures. Requires both a work profile
   * and a salary version effective on `asOf`; a future-dated change does not
   * count until it takes effect.
   */
  async getStatistics(userId: string, asOf: Date = new Date()): Promise<SalaryStatistics> {
    const [profile, effectiveVersion, upcomingVersion] = await Promise.all([
      this.profiles.findProfile(userId),
      this.profiles.findEffectiveSalaryVersion(userId, asOf),
      this.profiles.findUpcomingSalaryVersion(userId, asOf)
    ]);
    if (profile === null || effectiveVersion === null) {
      throw new FinancialProfileNotConfiguredError();
    }

    try {
      return calculateSalaryStatistics({
        profile,
        effectiveVersion,
        upcomingVersion,
        asOf,
        computedAt: new Date()
      });
    } catch (error) {
      // The calculator refuses to clamp: an amount that cannot be scaled
      // safely surfaces as a domain problem rather than a silent wrong number.
      if (error instanceof RangeError) throw new MoneyOutOfRangeError();
      throw error;
    }
  }
}
