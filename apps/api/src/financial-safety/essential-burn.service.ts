import { Inject, Injectable } from "@nestjs/common";
import { MonthSchema, type EssentialBurnResponse } from "@treasury-ops/shared";
import { Logger } from "nestjs-pino";

import { getPrecedingISTMonths, toISTMonth } from "../common/time/ist.js";
import { calculateEssentialBurn } from "./essential-burn.js";
import { EssentialBurnRepository } from "./essential-burn.repository.js";

export type EssentialBurnLogger = Pick<Logger, "log" | "error" | "warn">;

/**
 * Service that orchestrates trailing essential burn baseline calculation.
 *
 * Rules:
 * - Read-only operation.
 * - Resolves candidate 3 complete IST calendar months strictly before asOf.
 * - Queries bounded aggregate ledger facts via EssentialBurnRepository.
 * - Delegates averaging and quality determination to pure calculateEssentialBurn.
 * - Emits structured log events containing only metadata and counts — NEVER financial amounts.
 */
@Injectable()
export class EssentialBurnService {
  constructor(
    @Inject(Logger)
    private readonly logger: EssentialBurnLogger,
    private readonly repository: EssentialBurnRepository
  ) {}

  async getEssentialBurn(userId: string, asOf: Date = new Date()): Promise<EssentialBurnResponse> {
    const currentMonth = MonthSchema.parse(toISTMonth(asOf));
    const candidateMonths = getPrecedingISTMonths(asOf, 3);

    const monthlyFacts = await this.repository.getMonthlyLedgerExpenseFacts(
      userId,
      candidateMonths,
      currentMonth
    );

    const result = calculateEssentialBurn({
      asOf,
      candidateMonths,
      currentMonth,
      monthlyFacts
    });

    this.logger.log({
      event: "essential_burn.calculated",
      userId,
      asOf: asOf.toISOString(),
      formulaVersion: result.formulaVersion,
      quality: result.quality,
      observedCompleteMonthCount: result.observedCompleteMonthCount,
      candidateMonths
    });

    return result;
  }
}
