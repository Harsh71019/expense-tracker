import type { DashboardStats } from "@treasury-ops/shared";
import { formatSignedCompactMinor } from "@treasury-ops/shared";
import type { ReactNode } from "react";

import { Sparkline } from "@/features/assets";

type Stat = Readonly<{
  label: string;
  value: string;
  deltaPct: number | null;
  goodWhenUp: boolean;
  trend: readonly number[];
}>;

function deltaLabel(deltaPct: number | null): string {
  if (deltaPct === null) return "—";
  const rounded = Math.round(Math.abs(deltaPct));
  const arrow = deltaPct > 0 ? "↑" : deltaPct < 0 ? "↓" : "→";
  return `${arrow} ${rounded}% MoM`;
}

function isGood(deltaPct: number | null, goodWhenUp: boolean): boolean {
  if (deltaPct === null || deltaPct === 0) return true;
  return goodWhenUp ? deltaPct > 0 : deltaPct < 0;
}

export function StatCards({ stats }: Readonly<{ stats: DashboardStats }>): ReactNode {
  const items: readonly Stat[] = [
    {
      label: `SPENT · ${stats.period}`,
      value: formatSignedCompactMinor(stats.spent.valueMinor),
      deltaPct: stats.spent.deltaPct,
      goodWhenUp: false,
      trend: stats.spent.trend
    },
    {
      label: `INCOME · ${stats.period}`,
      value: formatSignedCompactMinor(stats.income.valueMinor),
      deltaPct: stats.income.deltaPct,
      goodWhenUp: true,
      trend: stats.income.trend
    },
    {
      label: "SAVINGS RATE",
      value: `${Math.round(stats.savingsRate.valuePct)}%`,
      deltaPct: stats.savingsRate.deltaPct,
      goodWhenUp: true,
      trend: stats.savingsRate.trend
    },
    {
      label: "NET WORTH",
      value: formatSignedCompactMinor(stats.netWorth.valueMinor),
      deltaPct: stats.netWorth.deltaPct,
      goodWhenUp: true,
      trend: stats.netWorth.trend
    }
  ];

  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      {items.map((stat) => {
        const good = isGood(stat.deltaPct, stat.goodWhenUp);
        const color = good ? "var(--color-income)" : "var(--color-expense)";
        return (
          <div
            key={stat.label}
            className="rounded-2xl border border-border bg-surface-elevated p-5"
          >
            <p className="font-mono text-[10px] font-semibold tracking-[1.2px] text-foreground-muted">
              {stat.label}
            </p>
            <p className="mt-2.5 font-mono text-[26px] font-bold tracking-tight text-foreground">
              {stat.value}
            </p>
            <div className="mt-2.5 flex items-center justify-between gap-2">
              <span
                className={`font-mono text-xs font-semibold ${good ? "text-income" : "text-expense"}`}
              >
                {deltaLabel(stat.deltaPct)}
              </span>
              {stat.trend.length > 1 ? (
                <Sparkline values={stat.trend} color={color} width={70} height={30} />
              ) : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}
