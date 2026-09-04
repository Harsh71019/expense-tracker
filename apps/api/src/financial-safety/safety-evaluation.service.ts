import { Inject, Injectable } from "@nestjs/common";
import { SafetyEvaluationSchema, type SafetyEvaluation } from "@treasury-ops/shared";
import { Logger } from "nestjs-pino";

import { DebtProfileService } from "../financial-profiles/debt-profile.service.js";
import { FinancialProfileService } from "../financial-profiles/financial-profile.service.js";
import { ProtectionService } from "../financial-profiles/protection.service.js";
import {
  IdempotencyPostgresService,
  type IdempotentResult
} from "../common/idempotency/idempotency-postgres.service.js";
import { SafetyBufferService } from "../safety-buffer/safety-buffer.service.js";
import { EssentialBurnService } from "./essential-burn.service.js";
import { ReserveValueService } from "./reserve-value.service.js";
import {
  computeSafetyInputFingerprint,
  type SafetyFingerprintInput
} from "./safety-input-fingerprint.js";
import { SAFETY_POLICY } from "./safety-policy.js";
import { SafetyEvaluationRepository } from "./safety-evaluation.repository.js";
import { evaluateSafety, type SafetyEvaluatorInput } from "./safety-evaluator.js";

export type SafetyEvaluationLogger = Pick<Logger, "log" | "error" | "warn">;

const ACTIVE_DEBT_PAGE_LIMIT = 200;

/**
 * Composed read/write service for the Safety Evaluation and Financial
 * Runway Clock.
 *
 * Rules:
 * - Composes narrow domain services concurrently via Promise.all; never
 *   duplicates Essential Burn or Reserve Value SQL, never opens Drizzle
 *   directly, never calls another service over HTTP.
 * - GET (`getEvaluation`) never mutates state.
 * - Refresh persists at most one immutable row per (user, fingerprint,
 *   formula version, policy version) -- concurrent identical refreshes
 *   converge through the repository's unique-index insert.
 * - Structured log events contain only counts, quality/stage keys, and
 *   durations -- never a financial amount.
 */
@Injectable()
export class SafetyEvaluationService {
  constructor(
    @Inject(Logger)
    private readonly logger: SafetyEvaluationLogger,
    private readonly essentialBurn: EssentialBurnService,
    private readonly reserveValue: ReserveValueService,
    private readonly protection: ProtectionService,
    private readonly financialProfile: FinancialProfileService,
    private readonly debts: DebtProfileService,
    private readonly safetyBuffer: SafetyBufferService,
    private readonly repository: SafetyEvaluationRepository,
    private readonly idempotency: IdempotencyPostgresService
  ) {}

  async getEvaluation(userId: string, asOf: Date = new Date()): Promise<SafetyEvaluation> {
    const startTime = performance.now();
    const facts = await this.gatherFacts(userId, asOf);
    const inputFingerprint = computeSafetyInputFingerprint(facts);

    const persisted = await this.repository.findByFingerprint(
      userId,
      inputFingerprint,
      SAFETY_POLICY.formulaVersion,
      SAFETY_POLICY.policyVersion
    );

    const evaluation =
      persisted !== null
        ? SafetyEvaluationSchema.parse({
            ...persisted.evaluation,
            evaluationId: persisted.id,
            snapshotStatus: "persisted" as const
          })
        : this.buildLiveEvaluation(facts, inputFingerprint);

    this.logResult("financial_safety.evaluation_read", userId, evaluation, startTime);
    return evaluation;
  }

  async refresh(
    userId: string,
    idempotencyKey: string,
    asOf?: Date
  ): Promise<IdempotentResult<SafetyEvaluation>> {
    const startTime = performance.now();
    // Resolved once for this call's own computation. Never used for the
    // idempotency request fingerprint below -- a `new Date()` default is a
    // server-resolved value, not client-supplied request content, so
    // fingerprinting on it would make two replay calls that both omit `asOf`
    // look like different requests and turn a safe retry into a 409.
    const effectiveAsOf = asOf ?? new Date();

    // Gather facts and compute the candidate evaluation before opening a
    // transaction (AGENTS.md #3.4: nothing slow inside a transaction --
    // gatherFacts is several concurrent service reads, one of them a
    // cursor-walked pagination loop, and none of it belongs holding a
    // Postgres transaction open). The transaction below does only the insert.
    const facts = await this.gatherFacts(userId, effectiveAsOf);
    const inputFingerprint = computeSafetyInputFingerprint(facts);
    const computed = evaluateSafety(this.toEvaluatorInput(facts, effectiveAsOf));
    const evaluationDraft = SafetyEvaluationSchema.parse({
      ...computed,
      evaluationId: null,
      snapshotStatus: "persisted" as const,
      formulaVersion: SAFETY_POLICY.formulaVersion,
      policyVersion: SAFETY_POLICY.policyVersion,
      inputFingerprint
    });

    return this.idempotency.execute(
      userId,
      "financial_safety.evaluation.refresh",
      idempotencyKey,
      { asOf: asOf?.toISOString() ?? null },
      SafetyEvaluationSchema,
      async (tx) => {
        const stored = await this.repository.insertIfAbsent(
          userId,
          {
            inputFingerprint,
            formulaVersion: SAFETY_POLICY.formulaVersion,
            policyVersion: SAFETY_POLICY.policyVersion,
            asOf: effectiveAsOf,
            sourceThrough: computed.sourceThrough,
            resultJson: evaluationDraft,
            createdAt: computed.computedAt
          },
          tx
        );

        const result = SafetyEvaluationSchema.parse({
          ...stored.evaluation,
          evaluationId: stored.id,
          snapshotStatus: "persisted" as const
        });
        this.logResult("financial_safety.evaluation_refreshed", userId, result, startTime);
        return result;
      }
    );
  }

  private buildLiveEvaluation(
    facts: SafetyFingerprintInput,
    inputFingerprint: string
  ): SafetyEvaluation {
    const computed = evaluateSafety(this.toEvaluatorInput(facts, facts.asOf));
    return SafetyEvaluationSchema.parse({
      ...computed,
      evaluationId: null,
      snapshotStatus: "live" as const,
      formulaVersion: SAFETY_POLICY.formulaVersion,
      policyVersion: SAFETY_POLICY.policyVersion,
      inputFingerprint
    });
  }

  private toEvaluatorInput(facts: SafetyFingerprintInput, asOf: Date): SafetyEvaluatorInput {
    return {
      asOf,
      computedAt: new Date(),
      sourceThrough: facts.essentialBurn.sourceThrough,
      essentialBurn: facts.essentialBurn,
      reserves: facts.reserves,
      protectionState: facts.protectionState,
      financialProfileState: facts.financialProfileState,
      activeDebtCount: facts.activeDebtCount,
      highCostDebtCount: facts.highCostDebtCount,
      safetyBufferState: facts.safetyBufferState
    };
  }

  private async gatherFacts(userId: string, asOf: Date): Promise<SafetyFingerprintInput> {
    const [
      essentialBurn,
      reserves,
      protectionState,
      financialProfileState,
      debtFacts,
      safetyBufferState
    ] = await Promise.all([
      this.essentialBurn.getEssentialBurn(userId, asOf),
      this.reserveValue.getSummary(userId, asOf),
      this.protection.getState(userId, asOf),
      this.financialProfile.getState(userId, asOf),
      this.loadActiveDebtFacts(userId),
      this.safetyBuffer.getState(userId, asOf)
    ]);

    return {
      asOf,
      essentialBurn,
      reserves,
      protectionState,
      financialProfileState,
      activeDebtCount: debtFacts.activeDebtCount,
      highCostDebtCount: debtFacts.highCostDebtCount,
      safetyBufferState
    };
  }

  /**
   * Every active-debt page, cursor-walked with no artificial cap -- the
   * high-cost count itself is already a full tenant-scoped aggregate from
   * `DebtProfileService.list`, computed once from the first page.
   */
  private async loadActiveDebtFacts(
    userId: string
  ): Promise<{ activeDebtCount: number; highCostDebtCount: number }> {
    const firstPage = await this.debts.list(userId, {
      status: "active",
      limit: ACTIVE_DEBT_PAGE_LIMIT
    });
    let activeDebtCount = firstPage.items.length;
    let nextCursor = firstPage.pageInfo.nextCursor;
    let hasMore = firstPage.pageInfo.hasMore;

    while (hasMore && nextCursor !== null) {
      const nextPage = await this.debts.list(userId, {
        status: "active",
        limit: ACTIVE_DEBT_PAGE_LIMIT,
        cursor: nextCursor
      });
      activeDebtCount += nextPage.items.length;
      nextCursor = nextPage.pageInfo.nextCursor;
      hasMore = nextPage.pageInfo.hasMore;
    }

    return { activeDebtCount, highCostDebtCount: firstPage.highCost.highCostCount };
  }

  private logResult(
    event: string,
    userId: string,
    evaluation: SafetyEvaluation,
    startTime: number
  ): void {
    const durationMs = Math.round(performance.now() - startTime);
    this.logger.log(
      {
        event,
        userId,
        snapshotStatus: evaluation.snapshotStatus,
        quality: evaluation.quality,
        currentStage: evaluation.currentStage,
        nextAction: evaluation.nextAction,
        runwayAvailability: evaluation.runway.availability,
        runwayTier: evaluation.runway.tier,
        durationMs
      },
      "Evaluated financial safety"
    );
  }
}
