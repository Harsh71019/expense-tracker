import { Inject, Injectable } from "@nestjs/common";
import {
  FinancialDiagnosticSchema,
  type DeclaredDebtPage,
  type FinancialDiagnostic
} from "@treasury-ops/shared";
import { Logger } from "nestjs-pino";

import { AccountDiagnosticReadService } from "../accounts/account-diagnostic-read.service.js";
import { AssetDiagnosticReadService } from "../assets/asset-diagnostic-read.service.js";
import { CategoryDiagnosticReadService } from "../categories/category-diagnostic-read.service.js";
import { DebtProfileService } from "../financial-profiles/debt-profile.service.js";
import { FinancialProfileService } from "../financial-profiles/financial-profile.service.js";
import { ProtectionService } from "../financial-profiles/protection.service.js";
import { ReserveSourceDiagnosticReadService } from "../financial-safety/reserve-source-diagnostic-read.service.js";
import { GoalDiagnosticReadService } from "../goals/goal-diagnostic-read.service.js";
import { SafetyBufferService } from "../safety-buffer/safety-buffer.service.js";
import { LedgerHistoryDiagnosticReadService } from "../transactions/ledger-history-diagnostic-read.service.js";
import { evaluateFinancialReadiness } from "./financial-readiness-evaluator.js";

export type FinancialDiagnosticLogger = Pick<Logger, "log" | "error">;

/**
 * Composed read service that orchestrates concurrent domain fact collection
 * and delegates to the pure evaluator to produce the Financial Readiness Diagnostic.
 *
 * Rules:
 * - Read-only; mutates no tables, repairs no rows.
 * - Reads independent domain facts concurrently via Promise.all.
 * - Parses the final result through FinancialDiagnosticSchema before returning.
 * - Structured log events contain only counts, durations, and status keys — NEVER financial amounts.
 */
@Injectable()
export class FinancialDiagnosticService {
  constructor(
    @Inject(Logger)
    private readonly logger: FinancialDiagnosticLogger,
    private readonly accounts: AccountDiagnosticReadService,
    private readonly categories: CategoryDiagnosticReadService,
    private readonly ledgerHistory: LedgerHistoryDiagnosticReadService,
    private readonly assets: AssetDiagnosticReadService,
    private readonly goals: GoalDiagnosticReadService,
    private readonly profiles: FinancialProfileService,
    private readonly protection: ProtectionService,
    private readonly debts: DebtProfileService,
    private readonly safetyBuffer: SafetyBufferService,
    private readonly reserveSources: ReserveSourceDiagnosticReadService
  ) {}

  async getDiagnostic(userId: string, asOf: Date = new Date()): Promise<FinancialDiagnostic> {
    const startTime = performance.now();
    const computedAt = new Date();

    const [
      accountFacts,
      categoryFacts,
      ledgerHistoryFacts,
      assetFacts,
      goalFacts,
      financialProfileState,
      protectionState,
      declaredDebts,
      safetyBufferState,
      reserveSourceFacts
    ] = await Promise.all([
      this.accounts.getAccountDiagnosticFacts(userId),
      this.categories.getCategoryDiagnosticFacts(userId),
      this.ledgerHistory.getLedgerHistoryDiagnosticFacts(userId, asOf),
      this.assets.getAssetDiagnosticFacts(userId, asOf),
      this.goals.getGoalDiagnosticFacts(userId),
      this.profiles.getState(userId, asOf),
      this.protection.getState(userId, asOf),
      this.loadAllActiveDebts(userId),
      this.safetyBuffer.getState(userId, asOf),
      this.reserveSources.getReserveSourceDiagnosticFacts(userId, asOf)
    ]);

    const diagnostic = evaluateFinancialReadiness({
      userId,
      asOf,
      computedAt,
      financialProfileState,
      protectionState,
      declaredDebts,
      safetyBufferState,
      accountFacts,
      categoryFacts,
      ledgerHistoryFacts,
      assetFacts,
      goalFacts,
      reserveSourceFacts
    });

    const parsed = FinancialDiagnosticSchema.parse(diagnostic);
    const durationMs = Math.round(performance.now() - startTime);

    this.logger.log(
      {
        event: "financial_diagnostic.evaluated",
        userId,
        overallStatus: parsed.overallStatus,
        readyCount: parsed.readyCount,
        totalRequiredCount: parsed.totalRequiredCount,
        nextAction: parsed.nextAction,
        durationMs
      },
      "Evaluated financial readiness diagnostic"
    );

    return parsed;
  }

  private async loadAllActiveDebts(userId: string): Promise<DeclaredDebtPage> {
    const firstPage = await this.debts.list(userId, { status: "active", limit: 200 });
    if (!firstPage.pageInfo.hasMore || firstPage.pageInfo.nextCursor === null) {
      return firstPage;
    }

    const allItems = [...firstPage.items];
    let nextCursor: string | null = firstPage.pageInfo.nextCursor;
    let hasMore: boolean = firstPage.pageInfo.hasMore;

    while (hasMore && nextCursor !== null) {
      const nextPage: DeclaredDebtPage = await this.debts.list(userId, {
        status: "active",
        limit: 200,
        cursor: nextCursor
      });
      allItems.push(...nextPage.items);
      nextCursor = nextPage.pageInfo.nextCursor;
      hasMore = nextPage.pageInfo.hasMore;
    }

    const highCostCount = allItems.filter((d) => d.isHighCost).length;

    return {
      items: allItems,
      pageInfo: {
        nextCursor: null,
        hasMore: false,
        limit: allItems.length
      },
      highCost: {
        ...firstPage.highCost,
        highCostCount
      }
    };
  }
}
