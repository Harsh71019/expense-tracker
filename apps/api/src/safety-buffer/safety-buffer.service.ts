import { Inject, Injectable } from "@nestjs/common";
import {
  SafetyBufferPreferenceSchema,
  SafetyBufferStateSchema,
  type CreateSafetyBufferPreference,
  type SafetyBufferPreference,
  type SafetyBufferState,
  type SafetyBufferVersionPage
} from "@treasury-ops/shared";

import { AccountRepository } from "../accounts/account.repository.js";
import { AuditRepository } from "../audit/audit.repository.js";
import { DATABASE_CONNECTION } from "../common/db/db.module.js";
import type { DrizzleDb } from "../common/db/db.module.js";
import { withTxn } from "../common/db/db-txn.js";
import type { DbTx } from "../common/db/db-txn.js";
import { EntityNotFoundError } from "../common/errors/entity-not-found.error.js";
import { istCalendarDateStartUtc } from "../common/time/ist.js";
import { ForecastingRepository } from "../insights/forecasting/forecasting.repository.js";
import {
  IdempotencyPostgresService,
  type IdempotentResult
} from "../common/idempotency/idempotency-postgres.service.js";
import { resolveSafetyBufferTarget } from "../goals/calculate-goal-feasibility.js";
import { SafetyBufferRepository } from "./safety-buffer.repository.js";

@Injectable()
export class SafetyBufferService {
  constructor(
    @Inject(DATABASE_CONNECTION) private readonly db: DrizzleDb,
    private readonly repository: SafetyBufferRepository,
    private readonly audit: AuditRepository,
    private readonly accounts: AccountRepository,
    private readonly forecasting: ForecastingRepository,
    private readonly idempotency: IdempotencyPostgresService
  ) {}

  async getEffective(
    userId: string,
    asOf: Date = new Date()
  ): Promise<SafetyBufferPreference | null> {
    return this.repository.findEffective(userId, asOf);
  }

  async getState(userId: string, asOf: Date = new Date()): Promise<SafetyBufferState> {
    const [pref, userAccounts, forecastInputs] = await Promise.all([
      this.repository.findEffective(userId, asOf),
      this.accounts.list(userId),
      this.forecasting.findInputs(userId, asOf)
    ]);

    const liquidAccounts = userAccounts.filter(
      (a) => !a.isArchived && a.type !== "credit_card" && a.type !== "investment"
    );
    const liquidBalanceMinor = liquidAccounts.reduce((sum, a) => sum + a.balanceMinor, 0);

    let emergencyGoal: { readonly targetMinor: number } | null = null;
    if (pref?.mode === "emergency_fund_goal" && pref.emergencyFundGoalId) {
      const goal = await this.repository.findGoal(userId, pref.emergencyFundGoalId);
      if (goal) {
        emergencyGoal = { targetMinor: goal.targetMinor };
      }
    }

    const monthlyEssentialOutflowMinor =
      forecastInputs.knownStreams
        .filter((s) => s.transactionType === "expense")
        .reduce((sum, s) => sum + s.amountMinor, 0) +
      forecastInputs.billsDue.reduce((sum, b) => sum + b.amountDueMinor, 0);

    const resolved = resolveSafetyBufferTarget(
      pref,
      liquidBalanceMinor,
      monthlyEssentialOutflowMinor,
      emergencyGoal
    );

    return SafetyBufferStateSchema.parse({
      preference: pref,
      isFallback: resolved.isFallback,
      fallbackPolicy: resolved.fallbackPolicy,
      targetMinor: resolved.targetMinor,
      liquidBalanceMinor,
      bufferGapMinor: resolved.liquidBufferGapMinor,
      bufferSurplusMinor: resolved.liquidBufferSurplusMinor,
      monthlyEssentialOutflowMinor
    });
  }

  async createVersion(
    userId: string,
    input: CreateSafetyBufferPreference,
    key?: string
  ): Promise<IdempotentResult<SafetyBufferPreference>> {
    if (key) {
      return this.idempotency.execute(
        userId,
        "safety_buffer.version.create",
        key,
        input,
        SafetyBufferPreferenceSchema,
        (tx) => this.createVersionInTx(userId, input, tx)
      );
    }
    const result = await withTxn(this.db, (tx) => this.createVersionInTx(userId, input, tx));
    return { replayed: false, result };
  }

  async createVersionInTx(
    userId: string,
    input: CreateSafetyBufferPreference,
    tx: DbTx
  ): Promise<SafetyBufferPreference> {
    if (input.mode === "emergency_fund_goal") {
      if (!input.emergencyFundGoalId) {
        throw new Error("emergencyFundGoalId is required for emergency_fund_goal mode.");
      }
      const goal = await this.repository.findGoal(userId, input.emergencyFundGoalId, tx);
      if (goal === null) {
        throw new EntityNotFoundError("Goal");
      }
    }

    const latest = await this.repository.findLatestVersion(userId, tx);
    const nextVersion = (latest?.version ?? 0) + 1;

    const rawEffectiveFrom = input.effectiveFrom ?? new Date();
    const effectiveFrom = istCalendarDateStartUtc(rawEffectiveFrom);

    const created = await this.repository.createVersion(
      userId,
      input,
      nextVersion,
      effectiveFrom,
      tx
    );

    await this.audit.record(userId, "safety_buffer.version_create", created.id, tx, {
      version: created.version,
      mode: created.mode,
      amountMinor: created.amountMinor,
      months: created.months,
      emergencyFundGoalId: created.emergencyFundGoalId,
      effectiveFrom: created.effectiveFrom
    });

    return created;
  }

  async listVersions(
    userId: string,
    cursor?: string,
    limit = 50
  ): Promise<SafetyBufferVersionPage> {
    return this.repository.listVersions(userId, cursor, limit);
  }
}
