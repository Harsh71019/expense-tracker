import { Injectable } from "@nestjs/common";
import {
  CashflowForecastSnapshotSchema,
  type CashflowForecastSnapshot
} from "@treasury-ops/shared";

import { toISTCalendarDate } from "../../common/time/ist.js";
import { safeIntegerFromBigInt } from "../../common/statistics/index.js";
import { calibratedRange, forecastOne, selectForecastModel } from "./forecast-models.js";
import {
  CASHFLOW_FORECAST_MINIMUM_DAYS,
  CASHFLOW_FORECAST_MINIMUM_ORIGINS,
  CASHFLOW_FORECAST_RESOURCE_CONTRACT,
  CASHFLOW_FORECAST_VERSION
} from "./forecasting.constants.js";
import { ForecastingRepository, type ForecastKnownStream } from "./forecasting.repository.js";

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 86_400_000);
}
function cadenceDays(cadence: ForecastKnownStream["cadence"]): number {
  return { weekly: 7, biweekly: 14, semimonthly: 15, monthly: 30, quarterly: 91, annual: 365 }[
    cadence
  ];
}
function scheduledAmount(
  streams: readonly ForecastKnownStream[],
  type: "income" | "expense",
  asOf: Date,
  days: number
): number {
  const end = addDays(asOf, days);
  let total = 0n;
  for (const stream of streams) {
    if (stream.transactionType !== type || stream.nextExpectedDate === null) continue;
    let due = new Date(`${stream.nextExpectedDate}T00:00:00.000Z`);
    for (
      let count = 0;
      due <= end && count < 20;
      count += 1, due = addDays(due, cadenceDays(stream.cadence))
    )
      if (due > asOf) total += BigInt(stream.amountMinor);
  }
  return safeIntegerFromBigInt(total, "known recurring forecast amount");
}
function integerSum(values: readonly number[], label: string): number {
  return safeIntegerFromBigInt(
    values.reduce((sum, value) => sum + BigInt(value), 0n),
    label
  );
}

@Injectable()
export class ForecastingService {
  constructor(private readonly repository: ForecastingRepository) {}
  async getLatest(userId: string, days: 30 | 60 | 90): Promise<CashflowForecastSnapshot | null> {
    return this.repository.findLatest(userId, days);
  }

  /** Worker-only computation. It reads bounded inputs first and persists one immutable snapshot last. */
  async computeUser(
    userId: string,
    asOf: Date,
    horizonDays: 30 | 60 | 90 = 30
  ): Promise<CashflowForecastSnapshot> {
    const started = Date.now();
    const input = await this.repository.findInputs(userId, asOf);
    const daily = new Map<string, number>();
    let excludedTransfers = 0;
    let excludedPurchases = 0;
    let excludedRecurring = 0;
    for (const transaction of input.transactions) {
      if (transaction.type !== "expense") continue;
      if (transaction.transferGroupId !== null) {
        excludedTransfers += 1;
        continue;
      }
      if (transaction.accountType === "credit_card" || transaction.billId !== null) {
        excludedPurchases += 1;
        continue;
      }
      if (input.recurringTransactionIds.has(transaction.id)) {
        excludedRecurring += 1;
        continue;
      }
      const key = toISTCalendarDate(transaction.occurredAt);
      daily.set(key, (daily.get(key) ?? 0) + transaction.amountMinor);
    }
    const values: number[] = [];
    for (
      let offset = CASHFLOW_FORECAST_RESOURCE_CONTRACT.lookbackDays - 1;
      offset >= 0;
      offset -= 1
    )
      values.push(daily.get(toISTCalendarDate(addDays(asOf, -offset))) ?? 0);
    const evaluation = input.rowBudgetHit ? null : selectForecastModel(values);
    const sufficient =
      evaluation !== null && evaluation.origins >= CASHFLOW_FORECAST_MINIMUM_ORIGINS;
    const variableDaily =
      sufficient && evaluation !== null ? forecastOne(evaluation.model, values) : 0;
    const variablePoint = safeIntegerFromBigInt(
      BigInt(variableDaily) * BigInt(horizonDays),
      "variable forecast amount"
    );
    const variableRange =
      sufficient && evaluation !== null
        ? calibratedRange(
            variablePoint,
            evaluation.residuals.map((value) => value * horizonDays)
          )
        : { lowerMinor: 0, upperMinor: 0, coverageBps: null };
    const knownIncome = scheduledAmount(input.knownStreams, "income", asOf, horizonDays);
    const knownOutflow = scheduledAmount(input.knownStreams, "expense", asOf, horizonDays);
    const billsDue = integerSum(
      input.billsDue
        .filter((bill) => bill.dueDate > asOf && bill.dueDate <= addDays(asOf, horizonDays))
        .map((bill) => Math.max(0, bill.amountDueMinor - bill.paidMinor)),
      "credit-card bills due"
    );
    const point = integerSum(
      [input.liquidBalanceMinor, knownIncome, -knownOutflow, -billsDue, -variablePoint],
      "forecast point balance"
    );
    const conservative = integerSum(
      [input.liquidBalanceMinor, knownIncome, -knownOutflow, -billsDue, -variableRange.upperMinor],
      "forecast conservative balance"
    );
    const resources = {
      rowsScanned: input.transactions.length,
      runtimeMs: Date.now() - started,
      rowBudgetHit: input.rowBudgetHit,
      timedOut: false,
      outcome: input.rowBudgetHit
        ? { status: "degraded" as const, reason: "resource_limit" as const }
        : sufficient
          ? { status: "completed" as const }
          : { status: "abstained" as const, reason: "insufficient_history" as const }
    };
    const snapshot = CashflowForecastSnapshotSchema.parse({
      id: crypto.randomUUID(),
      asOf,
      horizonDays,
      modelVersion: CASHFLOW_FORECAST_VERSION,
      inputWatermark: input.watermark,
      sufficiency: sufficient
        ? {
            status: "sufficient",
            observationCount: values.length,
            minimumRequired: CASHFLOW_FORECAST_MINIMUM_DAYS
          }
        : {
            status: "insufficient",
            reason: input.rowBudgetHit ? "resource_limit" : "insufficient_history",
            observationCount: values.length,
            minimumRequired: CASHFLOW_FORECAST_MINIMUM_DAYS
          },
      resources,
      model: sufficient && evaluation !== null ? evaluation.model : "known_cashflow_only",
      pointBalanceMinor: point,
      range: {
        lowerMinor: conservative,
        upperMinor: integerSum(
          [
            input.liquidBalanceMinor,
            knownIncome,
            -knownOutflow,
            -billsDue,
            -variableRange.lowerMinor
          ],
          "forecast optimistic balance"
        ),
        observedCoverageBps: variableRange.coverageBps,
        label: "historical_range"
      },
      assumptions: {
        liquidBalanceMinor: input.liquidBalanceMinor,
        knownRecurringInflowMinor: knownIncome,
        knownRecurringOutflowMinor: knownOutflow,
        creditCardBillsDueMinor: billsDue,
        excludedCreditCardPurchaseCount: excludedPurchases,
        excludedTransferCount: excludedTransfers,
        variableSpendExcludedRecurringCount: excludedRecurring,
        asOfDeterministic: true
      },
      metrics: {
        evaluatedOriginCount: evaluation?.origins ?? 0,
        maeMinor: evaluation?.maeMinor ?? null,
        maseBps: null,
        baselineMaeMinor: null,
        residualCount: evaluation?.residuals.length ?? 0,
        observedCoverageBps: variableRange.coverageBps,
        eligibleForHorizon: horizonDays === 30 && sufficient
      },
      shortfall: {
        hasPotentialShortfall: conservative < 0,
        firstPotentialShortfallDate:
          conservative < 0 ? toISTCalendarDate(addDays(asOf, horizonDays)) : null,
        conservativeBalanceMinor: conservative,
        mode: "read_only"
      },
      computedAt: new Date()
    });
    return this.repository.insertSnapshot(userId, snapshot);
  }
}
