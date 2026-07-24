import { Injectable } from "@nestjs/common";
import {
  computeNextOccurrence,
  type CashflowBucket,
  type CashflowResponse,
  type CategoryRollup,
  type DashboardInvestments,
  type DashboardRange,
  type DashboardStats,
  type DashboardSummary,
  type Month,
  type RecentActivityItem,
  type RecurringForecast,
  type RecurringForecastUpcomingItem,
  type SpendMix,
  type TopSpendingItem
} from "@treasury-ops/shared";

import { AccountRepository } from "../accounts/account.repository.js";
import { AssetRepository } from "../assets/asset.repository.js";
import { ValuationRepository } from "../assets/valuation.repository.js";
import { CategoryRepository } from "../categories/category.repository.js";
import { toISTMonth } from "../common/time/ist.js";
import { MonthlyRollupService } from "../reports/monthly-rollup.service.js";
import { RecurringRuleRepository } from "../recurring/recurring-rule.repository.js";
import { TransactionRepository } from "../transactions/transaction.repository.js";
import { enrichCategoryTotal, mergeCategoryRollups } from "./dashboard-category.js";
import {
  chunk,
  deltaPct,
  endOfISTDay,
  istMonthEndInstant,
  listISTDayKeys,
  monthWindow,
  savingsRatePct,
  startOfISTDay
} from "./dashboard-date.js";
import { DashboardRepository } from "./dashboard.repository.js";

const TREND_MONTHS = 6;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const RANGE_DAYS: Record<DashboardRange, number> = { "1W": 7, "1M": 30, "6M": 182, "12M": 365 };
const RANGE_MONTHS: Readonly<Record<"6M" | "12M", number>> = { "6M": 6, "12M": 12 };

@Injectable()
export class DashboardService {
  constructor(
    private readonly accounts: AccountRepository,
    private readonly transactions: TransactionRepository,
    private readonly categories: CategoryRepository,
    private readonly assetRepository: AssetRepository,
    private readonly valuations: ValuationRepository,
    private readonly recurringRules: RecurringRuleRepository,
    private readonly rollups: MonthlyRollupService,
    private readonly dashboard: DashboardRepository
  ) {}

  async getSummary(userId: string): Promise<DashboardSummary> {
    const accounts = await this.accounts.list(userId);
    let totalBalanceMinor = 0;
    let assetsMinor = 0;
    let liabilitiesMinor = 0;
    for (const account of accounts) {
      totalBalanceMinor += account.balanceMinor;
      if (account.balanceMinor >= 0) assetsMinor += account.balanceMinor;
      else liabilitiesMinor += -account.balanceMinor;
    }
    return {
      totalBalanceMinor,
      activeAccountCount: accounts.length,
      assetsMinor,
      liabilitiesMinor
    };
  }

  async getRecentActivity(userId: string, limit: number): Promise<RecentActivityItem[]> {
    const [page, accounts] = await Promise.all([
      this.transactions.findMany(userId, { limit }),
      this.accounts.list(userId)
    ]);
    const nameById = new Map(accounts.map((account) => [account.id, account.name]));
    return page.items.map((txn) => ({
      id: txn.id,
      accountId: txn.accountId,
      accountName: nameById.get(txn.accountId) ?? "Unknown account",
      ...(txn.categoryId === undefined ? {} : { categoryId: txn.categoryId }),
      type: txn.type,
      amountMinor: txn.amountMinor,
      description: txn.description,
      occurredAt: txn.occurredAt,
      tags: txn.tags
    }));
  }

  async getStats(userId: string, period: Month | undefined): Promise<DashboardStats> {
    const month = period ?? toISTMonth(new Date());
    const months = monthWindow(month, TREND_MONTHS);
    const monthRollups = await Promise.all(months.map((m) => this.rollups.getOrCompute(userId, m)));

    const spentTrend = monthRollups.map((r) => r?.totalExpenseMinor ?? 0);
    const incomeTrend = monthRollups.map((r) => r?.totalIncomeMinor ?? 0);
    const savingsRateTrend = spentTrend.map((spent, i) =>
      savingsRatePct(incomeTrend[i] ?? 0, spent)
    );

    const currentMonth = toISTMonth(new Date());
    const netWorthTrend = await Promise.all(
      months.map((m) => {
        const asOf = m === currentMonth ? new Date() : istMonthEndInstant(m);
        return this.netWorthMinorAsOf(userId, asOf);
      })
    );

    const last = months.length - 1;
    const prev = last - 1;
    return {
      period: month,
      spent: {
        valueMinor: valueAt(spentTrend, last),
        deltaPct: deltaPct(valueAt(spentTrend, last), valueAt(spentTrend, prev)),
        trend: spentTrend
      },
      income: {
        valueMinor: valueAt(incomeTrend, last),
        deltaPct: deltaPct(valueAt(incomeTrend, last), valueAt(incomeTrend, prev)),
        trend: incomeTrend
      },
      savingsRate: {
        valuePct: valueAt(savingsRateTrend, last),
        deltaPct: deltaPct(valueAt(savingsRateTrend, last), valueAt(savingsRateTrend, prev)),
        trend: savingsRateTrend
      },
      netWorth: {
        valueMinor: valueAt(netWorthTrend, last),
        deltaPct: deltaPct(valueAt(netWorthTrend, last), valueAt(netWorthTrend, prev)),
        trend: netWorthTrend
      }
    };
  }

  async getCashflow(userId: string, range: DashboardRange): Promise<CashflowResponse> {
    if (range === "1W" || range === "1M") {
      const days = RANGE_DAYS[range];
      const to = new Date();
      const from = new Date(to.getTime() - (days - 1) * ONE_DAY_MS);
      const daily = await this.dashboard.cashflowDaily(
        userId,
        startOfISTDay(from),
        endOfISTDay(to)
      );
      const dayKeys = listISTDayKeys(from, to);

      if (range === "1W") {
        const buckets: CashflowBucket[] = dayKeys.map((day) => {
          const totals = daily.get(day);
          return {
            label: day,
            incomeMinor: totals?.incomeMinor ?? 0,
            expenseMinor: totals?.expenseMinor ?? 0
          };
        });
        return { range, buckets };
      }

      const buckets: CashflowBucket[] = chunk(dayKeys, 7).map((week) => {
        const summed = week.reduce(
          (acc, day) => {
            const totals = daily.get(day);
            return {
              incomeMinor: acc.incomeMinor + (totals?.incomeMinor ?? 0),
              expenseMinor: acc.expenseMinor + (totals?.expenseMinor ?? 0)
            };
          },
          { incomeMinor: 0, expenseMinor: 0 }
        );
        const label = week[0];
        if (label === undefined) throw new Error("Cashflow week chunk was unexpectedly empty.");
        return { label, ...summed };
      });
      return { range, buckets };
    }

    const monthCount = RANGE_MONTHS[range];
    const months = monthWindow(toISTMonth(new Date()), monthCount);
    const monthRollups = await Promise.all(months.map((m) => this.rollups.getOrCompute(userId, m)));
    const buckets: CashflowBucket[] = months.map((m, i) => ({
      label: m,
      incomeMinor: monthRollups[i]?.totalIncomeMinor ?? 0,
      expenseMinor: monthRollups[i]?.totalExpenseMinor ?? 0
    }));
    return { range, buckets };
  }

  async getTopSpending(
    userId: string,
    range: DashboardRange,
    limit: number
  ): Promise<TopSpendingItem[]> {
    const [totals, categories] = await Promise.all([
      this.categoryTotalsForRange(userId, range),
      this.categories.list(userId)
    ]);
    const categoriesById = new Map(categories.map((category) => [category.id, category]));
    return totals
      .map((total) => enrichCategoryTotal(total, categoriesById))
      .sort((a, b) => b.amountMinor - a.amountMinor)
      .slice(0, limit);
  }

  async getSpendMix(userId: string, range: DashboardRange): Promise<SpendMix> {
    const [totals, categories] = await Promise.all([
      this.categoryTotalsForRange(userId, range),
      this.categories.list(userId)
    ]);
    const categoriesById = new Map(categories.map((category) => [category.id, category]));

    let essential = 0;
    let lifestyle = 0;
    let uncategorized = 0;
    for (const total of totals) {
      const category =
        total.categoryId === undefined ? undefined : categoriesById.get(total.categoryId);
      if (category?.group === "essential") essential += total.spentMinor;
      else if (category?.group === "lifestyle") lifestyle += total.spentMinor;
      else uncategorized += total.spentMinor;
    }
    const totalMinor = essential + lifestyle + uncategorized;
    const pct = (value: number): number => (totalMinor === 0 ? 0 : (value / totalMinor) * 100);

    return {
      range,
      totalMinor,
      essential: { amountMinor: essential, pct: pct(essential) },
      lifestyle: { amountMinor: lifestyle, pct: pct(lifestyle) },
      uncategorized: { amountMinor: uncategorized, pct: pct(uncategorized) }
    };
  }

  async getInvestments(userId: string): Promise<DashboardInvestments> {
    const assets = await this.assetRepository.list(userId);
    const relevant = assets.filter(
      (asset) => asset.kind === "investment" || asset.kind === "fixed_deposit"
    );
    const items = await Promise.all(
      relevant.map(async (asset) => {
        const valuationHistory = await this.valuations.listByAsset(userId, asset.id);
        const latest = valuationHistory[0];
        const opening = valuationHistory[valuationHistory.length - 1];
        const currentValueMinor = latest?.valueMinor ?? 0;
        const returnPct =
          latest !== undefined && opening !== undefined && opening.valueMinor !== 0
            ? ((latest.valueMinor - opening.valueMinor) / Math.abs(opening.valueMinor)) * 100
            : null;
        const series = [...valuationHistory]
          .reverse()
          .map((valuation) => ({ valuedAt: valuation.valuedAt, valueMinor: valuation.valueMinor }));
        return {
          assetId: asset.id,
          name: asset.name,
          kind: asset.kind,
          currentValueMinor,
          returnPct,
          series
        };
      })
    );
    return { items };
  }

  async getRecurringForecast(userId: string, range: DashboardRange): Promise<RecurringForecast> {
    const now = new Date();
    const windowEnd = new Date(now.getTime() + RANGE_DAYS[range] * ONE_DAY_MS);
    const [rules, categories] = await Promise.all([
      this.recurringRules.list(userId),
      this.categories.list(userId)
    ]);
    const categoriesById = new Map(categories.map((category) => [category.id, category]));

    let inMinor = 0;
    let outMinor = 0;
    const upcoming: RecurringForecastUpcomingItem[] = [];
    for (const rule of rules.filter((r) => !r.isPaused)) {
      let occurrence: Date | null = rule.nextRunAt;
      while (occurrence !== null && occurrence.getTime() <= windowEnd.getTime()) {
        if (occurrence.getTime() >= now.getTime()) {
          if (rule.template.type === "income") inMinor += rule.template.amountMinor;
          else outMinor += rule.template.amountMinor;

          const category =
            rule.template.categoryId === undefined
              ? undefined
              : categoriesById.get(rule.template.categoryId);
          upcoming.push({
            ruleId: rule.id,
            name: rule.template.description,
            ...(category?.icon === undefined ? {} : { icon: category.icon }),
            type: rule.template.type,
            amountMinor: rule.template.amountMinor,
            nextRunAt: occurrence
          });
        }
        occurrence = computeNextOccurrence(rule.rrule, rule.startAt, occurrence);
      }
    }
    upcoming.sort((a, b) => a.nextRunAt.getTime() - b.nextRunAt.getTime());

    return {
      range,
      inMinor,
      outMinor,
      netMinor: inMinor - outMinor,
      upcoming: upcoming.slice(0, 10)
    };
  }

  private async netWorthMinorAsOf(userId: string, asOf: Date): Promise<number> {
    const [accountsMinor, assetsMinor] = await Promise.all([
      this.dashboard.accountsBalanceMinorAsOf(userId, asOf),
      this.dashboard.assetsValueMinorAsOf(userId, asOf)
    ]);
    return accountsMinor + assetsMinor;
  }

  private async categoryTotalsForRange(
    userId: string,
    range: DashboardRange
  ): Promise<CategoryRollup[]> {
    if (range === "1W" || range === "1M") {
      const days = RANGE_DAYS[range];
      const to = new Date();
      const from = new Date(to.getTime() - (days - 1) * ONE_DAY_MS);
      return this.dashboard.categoryTotals(userId, startOfISTDay(from), endOfISTDay(to));
    }
    const months = monthWindow(toISTMonth(new Date()), RANGE_MONTHS[range]);
    const monthRollups = await Promise.all(months.map((m) => this.rollups.getOrCompute(userId, m)));
    const byCategoryAcrossMonths = monthRollups.flatMap((rollup) => rollup?.byCategory ?? []);
    return mergeCategoryRollups(byCategoryAcrossMonths);
  }
}

function valueAt(values: readonly number[], index: number): number {
  return values[index] ?? 0;
}
